import { randomUUID } from "node:crypto";

function localDateTime(daysAhead, hour) {
  const date = new Date(Date.now() + daysAhead * 86400000);
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-US", {
      timeZone: "America/New_York",
      year: "numeric", month: "2-digit", day: "2-digit",
    }).formatToParts(date).filter((part) => part.type !== "literal")
      .map((part) => [part.type, part.value]),
  );
  return `${parts.year}-${parts.month}-${parts.day}T${String(hour).padStart(2, "0")}:00`;
}

export async function validateRentalMarketplace(db, { assert, expectDatabaseError }) {
  const actor = "f1000000-0000-4000-8000-000000000001";
  const outsider = "f1000000-0000-4000-8000-000000000002";
  const org = (await db.query(
    "select id from public.organizations where slug='listing-homeowner'"
  )).rows[0]?.id;
  assert(org, "B5 requires the B1 self-managing listing fixture.");

  const act = async (userId = actor) => {
    await db.exec(`reset role; set role authenticated; set request.jwt.claim.sub='${userId}'`);
  };
  const rpc = async (name, argsSql, params = []) =>
    (await db.query(`select public.${name}(${argsSql}) as r`, params)).rows[0].r;

  await act();
  const first = (await db.query(
    "select id,public_id,unit_id,version,status,visibility from public.rental_listings where organization_id=$1 and status<>'closed' order by created_at limit 1",
    [org],
  )).rows[0];
  assert(first?.status === "draft" && first.visibility === "unlisted",
    "B1 fixture did not leave a private relisting draft for B5.");

  await db.exec("reset role; set role service_role");
  const before = await rpc(
    "search_public_rental_listings",
    "null,null,null,null,null,null,null,null,null,null,12",
  );
  assert(!before.items.some((item) => item.publicId === first.public_id),
    "Unlisted listing entered discovery before opt-in.");

  await act();
  const published = await rpc(
    "set_rental_listing_status",
    "$1,$2,$3,'published',$4",
    [org, first.id, first.version, randomUUID()],
  );
  const key = randomUUID();
  const discovered = await rpc(
    "set_rental_listing_visibility",
    "$1,$2,$3,'discoverable',$4",
    [org, first.id, published.version, key],
  );
  assert(discovered.visibility === "discoverable" && discovered.discoveredAt,
    "Explicit discovery opt-in did not persist.");
  const replay = await rpc(
    "set_rental_listing_visibility",
    "$1,$2,$3,'discoverable',$4",
    [org, first.id, published.version, key],
  );
  assert(replay.version === discovered.version,
    "Discovery opt-in replay changed the listing again.");

  await db.exec("reset role; set role service_role");
  const result = await rpc(
    "search_public_rental_listings",
    "'US','VA','Fairfax',null,null,null,null,null,null,null,12",
  );
  const item = result.items.find((row) => row.publicId === first.public_id);
  assert(item && item.location.locality === "Fairfax",
    "Discoverable listing was not returned by coarse-location search.");
  const serialized = JSON.stringify(item);
  assert(!serialized.includes("900 Private Street") && !serialized.includes("22030"),
    "Discovery result leaked private street or postal data.");
  assert(item.heroPhoto?.storagePath && !("organizationId" in item),
    "Discovery result did not stay within the sanitized advertising DTO.");

  const detail = await rpc("get_public_rental_listing", "$1", [first.public_id]);
  assert(detail?.visibility === "discoverable",
    "Discoverable listing stopped resolving through the existing detail pipeline.");

  const inquiry = await rpc(
    "submit_public_rental_inquiry",
    "$1,'Discovery','Visitor','discovery-inquiry@example.com','Is parking available every day?',$2,'en-US',$3",
    [first.public_id, "1".repeat(64), randomUUID()],
  );
  assert(inquiry.accepted === true, "Discoverable listing did not reuse the inquiry pipeline.");

  const tour = await rpc(
    "submit_public_rental_tour_request",
    "$1,'Discovery','Visitor','discovery-tour@example.com',$2::jsonb,$3,'en-US',$4",
    [first.public_id, JSON.stringify([localDateTime(7, 13)]), "2".repeat(64), randomUUID()],
  );
  assert(tour.accepted === true, "Discoverable listing did not reuse the tour pipeline.");

  const moveOn = (await db.query(
    "select ((now() at time zone 'America/New_York')::date + 30)::text as day"
  )).rows[0].day;
  const application = await rpc(
    "submit_public_rental_application",
    "$1,'Discovery','Applicant','discovery-application@example.com',$2::date,'12 months','',$3,'en-US',$4",
    [first.public_id, moveOn, "3".repeat(64), randomUUID()],
  );
  assert(application.accepted === true, "Discoverable listing did not reuse the application pipeline.");

  await db.exec("reset role");
  const secondSource = (await db.query(`
    select u.id as unit_id,dv.id as version_id
    from public.units u
    join public.documents d on d.unit_id=u.id and d.organization_id=u.organization_id
    join public.document_versions dv on dv.document_id=d.id and dv.organization_id=d.organization_id
    where u.organization_id=$1 and u.id<>$2
      and d.document_type='rental_listing_photo' and d.status='active'
      and dv.upload_status='clean'
    order by u.id limit 1
  `, [org, first.unit_id])).rows[0];
  assert(secondSource, "B5 pagination fixture is missing the second clean-photo rental.");

  await act();
  const secondDraft = await rpc("save_rental_listing", "$1,$2,0,$3::jsonb,$4", [
    org,
    secondSource.unit_id,
    JSON.stringify({
      title: "Upstairs room",
      summary: "A bright room with shared common spaces and a straightforward monthly rental setup.",
      rentAmountMinor: 95000,
      availableOn: "2026-11-01",
      leaseTermText: "Flexible term",
      petsText: "Ask about pets",
      utilitiesText: "Utilities discussed with landlord",
      parkingText: "Street parking",
      visibility: "unlisted",
      photos: [{ documentVersionId: secondSource.version_id, altText: "Upstairs room" }],
    }),
    randomUUID(),
  ]);
  const secondPublished = await rpc("set_rental_listing_status", "$1,$2,$3,'published',$4", [
    org, secondDraft.listingId, secondDraft.version, randomUUID(),
  ]);
  const secondDiscovered = await rpc("set_rental_listing_visibility", "$1,$2,$3,'discoverable',$4", [
    org, secondDraft.listingId, secondPublished.version, randomUUID(),
  ]);
  assert(secondDiscovered.visibility === "discoverable", "Second listing did not enter discovery.");

  await db.exec("reset role; set role service_role");
  const firstPage = await rpc("search_public_rental_listings", "null,null,null,null,null,null,null,null,null,null,1");
  assert(firstPage.items.length === 1 && firstPage.nextCursor, "Discovery first page did not emit a cursor.");
  const secondPage = await rpc("search_public_rental_listings", "$1,$2,$3,null,null,null,null,null,$4,$5,1", [
    null, null, null, firstPage.nextCursor.discoveredAt, firstPage.nextCursor.id,
  ]);
  assert(secondPage.items.length === 1
    && secondPage.items[0].publicId !== firstPage.items[0].publicId
    && secondPage.nextCursor === null,
  "Discovery cursor duplicated/skipped a stable second row.");

  await db.exec("reset role; set role anon");
  await expectDatabaseError(
    () => rpc("search_public_rental_listings", "null,null,null,null,null,null,null,null,null,null,12"),
    "permission denied for function search_public_rental_listings",
  );

  await act(outsider);
  await expectDatabaseError(
    () => rpc("set_rental_listing_visibility", "$1,$2,$3,'unlisted',$4",
      [org, first.id, discovered.version, randomUUID()]),
    "PROPERTY_SCOPE_DENIED",
  );
  await act();
  await expectDatabaseError(
    () => rpc("set_rental_listing_visibility", "$1,$2,$3,'unlisted',$4",
      [org, first.id, published.version, randomUUID()]),
    "LISTING_VERSION_CONFLICT",
  );

  await db.exec("reset role");
  const current = (await db.query(
    "select title,summary,rent_amount_minor,available_on,lease_term_text,pets_text,utilities_text,parking_text from public.rental_listings where id=$1",
    [first.id],
  )).rows[0];
  const photo = (await db.query(
    "select document_version_id,alt_text from public.rental_listing_photos where listing_id=$1 order by sort_order limit 1",
    [first.id],
  )).rows[0];
  const editedDetails = {
    title: current.title,
    summary: current.summary + " Updated for a fresh landlord review.",
    rentAmountMinor: Number(current.rent_amount_minor),
    availableOn: new Date(current.available_on).toISOString().slice(0,10),
    leaseTermText: current.lease_term_text,
    petsText: current.pets_text,
    utilitiesText: current.utilities_text,
    parkingText: current.parking_text,
    visibility: "unlisted",
    photos: [{ documentVersionId: photo.document_version_id, altText: photo.alt_text }],
  };

  await act();
  const edited = await rpc(
    "save_rental_listing",
    "$1,$2,$3,$4::jsonb,$5",
    [org, first.unit_id, discovered.version, JSON.stringify(editedDetails), randomUUID()],
  );
  assert(edited.status === "draft" && edited.visibility === "unlisted",
    "Editing a discoverable listing did not return it to draft/unlisted.");

  await db.exec("reset role");
  const editedRow = (await db.query(
    "select discovered_at from public.rental_listings where id=$1",
    [first.id],
  )).rows[0];
  assert(editedRow.discovered_at === null,
    "Editing a discoverable listing retained discovery timestamp.");

  await db.exec("set role service_role");
  const afterEdit = await rpc(
    "search_public_rental_listings",
    "null,null,null,null,null,null,null,null,null,null,12",
  );
  assert(!afterEdit.items.some((row) => row.publicId === first.public_id),
    "Edited draft remained discoverable.");

  await act();
  const republished = await rpc(
    "set_rental_listing_status",
    "$1,$2,$3,'published',$4",
    [org, first.id, edited.version, randomUUID()],
  );
  assert(republished.visibility === "unlisted",
    "Republishing silently restored discovery.");

  const rediscovered = await rpc(
    "set_rental_listing_visibility",
    "$1,$2,$3,'discoverable',$4",
    [org, first.id, republished.version, randomUUID()],
  );
  const paused = await rpc(
    "set_rental_listing_status",
    "$1,$2,$3,'paused',$4",
    [org, first.id, rediscovered.version, randomUUID()],
  );
  assert(paused.status === "paused" && paused.visibility === "unlisted",
    "Pausing a discoverable listing did not fail safe to unlisted.");

  await db.exec("reset role; set role service_role");
  const afterPause = await rpc(
    "search_public_rental_listings",
    "null,null,null,null,null,null,null,null,null,null,12",
  );
  assert(!afterPause.items.some((row) => row.publicId === first.public_id),
    "Paused listing remained in marketplace search.");

  await db.exec("reset role");
  return {
    explicitOptIn: true,
    unlistedExcluded: true,
    coarseLocationOnly: true,
    serviceOnlySearch: true,
    outsiderDenied: true,
    staleVersionDenied: true,
    editFailsSafe: true,
    republishDoesNotRestoreDiscovery: true,
    pauseFailsSafe: true,
    paginationStable: true,
    existingLeadPipelineReused: true,
  };
}
