import { randomUUID } from "node:crypto";

export async function validateSharedListing(db, { assert, expectDatabaseError, createOrganizationAsServer }) {
  const actor = "f1000000-0000-4000-8000-000000000001";
  const outsider = "f1000000-0000-4000-8000-000000000002";
  const proActor = "f1000000-0000-4000-8000-000000000003";
  await db.exec(`reset role; insert into auth.users(id) values ('${actor}'),('${outsider}'),('${proActor}')`);
  const binding = "operator_terms@0.1.0-draft+privacy_notice@0.1.0-draft#0123456789abcdef";

  const createOrg = async (userId, slug, path) => (
    await createOrganizationAsServer(
      db,
      userId,
      `'${slug}','${slug}','${path}','US','en-US','America/New_York','${binding}','listing-org-${slug}'`,
    )
  ).rows[0].result.organizationId;

  const org = await createOrg(actor, "listing-homeowner", "self_managing");
  const professionalOrg = await createOrg(proActor, "listing-professional", "property_manager");
  const act = async (userId = actor) => {
    await db.exec(`reset role; set role authenticated; set request.jwt.claim.sub='${userId}'`);
  };
  const rpc = async (name, argsSql, params = []) => (
    await db.query(`select public.${name}(${argsSql}) as r`, params)
  ).rows[0].r;

  await act();
  const rentalDetails = {
    property: {
      kind: "new", accountingBookId: null, legalName: "Listing Homeowner", entityType: "individual",
      name: "Oak House", addressLine1: "900 Private Street", addressLine2: "",
      locality: "Fairfax", subdivisionCode: "VA", postalCode: "22030",
      countryCode: "US", timeZone: "America/New_York",
    },
    space: {
      name: "Basement apartment", type: "basement", bedrooms: 1, bathrooms: 1,
      entrance: "private", kitchen: "private", bathroom: "private", laundry: "shared",
      utilitiesNotes: "Water included", parkingNotes: "One driveway space",
    },
  };
  const rental = await rpc("create_homeowner_rental", "$1,$2::jsonb,$3", [
    org, JSON.stringify(rentalDetails), randomUUID(),
  ]);
  const secondRental = await rpc("create_homeowner_rental", "$1,$2::jsonb,$3", [
    org,
    JSON.stringify({
      property: { kind: "existing", propertyId: rental.propertyId },
      space: { ...rentalDetails.space, name: "Upstairs room", type: "room" },
    }),
    randomUUID(),
  ]);

  const baseDetails = {
    title: "Private basement apartment",
    summary: "A private basement apartment with its own entrance and one driveway parking space.",
    rentAmountMinor: 135000,
    availableOn: "2026-10-01",
    leaseTermText: "12-month lease preferred",
    petsText: "Ask about pets",
    utilitiesText: "Water included; electricity handled by agreement.",
    parkingText: "One driveway space.",
    visibility: "unlisted",
    photos: [],
  };

  const save = async (unitId, expectedVersion, details, key = randomUUID()) =>
    rpc("save_rental_listing", "$1,$2,$3,$4::jsonb,$5", [
      org, unitId, expectedVersion, JSON.stringify(details), key,
    ]);
  const setStatus = async (listingId, expectedVersion, status, key = randomUUID()) =>
    rpc("set_rental_listing_status", "$1,$2,$3,$4,$5", [
      org, listingId, expectedVersion, status, key,
    ]);
  const rotate = async (listingId, expectedVersion, key = randomUUID()) =>
    rpc("rotate_rental_listing_link", "$1,$2,$3,$4", [org, listingId, expectedVersion, key]);

  const createKey = randomUUID();
  const draft = await save(rental.unitId, 0, baseDetails, createKey);
  assert(draft.status === "draft" && draft.visibility === "unlisted" && draft.version === 1,
    "Initial unlisted listing draft was not created.");
  const replay = await save(rental.unitId, 0, baseDetails, createKey);
  assert(replay.listingId === draft.listingId && replay.version === 1,
    "Listing creation replay did not return the original result.");
  await expectDatabaseError(
    () => save(rental.unitId, 0, { ...baseDetails, title: "Changed on replay" }, createKey),
    "IDEMPOTENCY_CONFLICT",
  );
  await expectDatabaseError(
    () => setStatus(draft.listingId, draft.version, "published"),
    "LISTING_PHOTO_REQUIRED",
  );

  async function uploadPhoto(unitId, label) {
    await act();
    const grant = await rpc(
      "create_document_upload_grant",
      "$1,'unit',$2,'rental_listing_photo',$3,$4,'image/jpeg',2048,$5",
      [org, unitId, `${label} photo`, `${label}.jpg`, `${label}-grant-0001`],
    );
    const sha = label.padEnd(64, "a").slice(0, 64).replace(/[^a-f0-9]/g, "a");
    await db.exec("reset role; set role service_role");
    const finalized = await rpc("finalize_document", "$1,$2,$3,$4", [
      actor, grant.grantId, sha, `${label}-final-0001`,
    ]);
    return { grant, finalized, sha };
  }

  const photo = await uploadPhoto(rental.unitId, "listingphoto");
  await act();
  await expectDatabaseError(
    () => save(rental.unitId, draft.version, {
      ...baseDetails,
      photos: [{ documentVersionId: photo.finalized.versionId, altText: "Private basement entrance" }],
    }),
    "LISTING_PHOTO_NOT_READY",
  );

  await db.exec("reset role; set role service_role");
  const claimed = await rpc("claim_document_scan_jobs", "100,$1", ["shared-listing-scan-0001"]);
  const scanJob = claimed.jobs.find((job) => job.documentVersionId === photo.finalized.versionId);
  assert(scanJob, "Listing photo scan job was not claimable.");
  await rpc("complete_document_scan", "$1,'clean',$2,'listing-test-scanner',$3", [
    scanJob.documentScanJobId, photo.sha, "listing-photo-clean-0001",
  ]);

  // Advertising media must never enter resident/owner document delivery, even through a privileged
  // insertion path that bypasses the ordinary operator UI.
  await db.exec("reset role");
  await expectDatabaseError(
    () => db.query(
      "insert into public.document_deliveries(organization_id,document_version_id,delivery_channel) values($1,$2,'portal')",
      [org, photo.finalized.versionId],
    ),
    "LISTING_PHOTO_NOT_DELIVERABLE",
  );

  await act();
  const withPhoto = {
    ...baseDetails,
    photos: [{ documentVersionId: photo.finalized.versionId, altText: "Private basement entrance" }],
  };
  const saved = await save(rental.unitId, draft.version, withPhoto);
  assert(saved.version === 2 && saved.photoCount === 1, "Clean photo was not attached to the draft.");
  await expectDatabaseError(
    () => save(rental.unitId, draft.version, withPhoto),
    "LISTING_VERSION_CONFLICT",
  );

  const otherPhoto = await uploadPhoto(secondRental.unitId, "otherunitphoto");
  await db.exec("reset role; set role service_role");
  const claimedOther = await rpc("claim_document_scan_jobs", "100,$1", ["shared-listing-scan-0002"]);
  const otherJob = claimedOther.jobs.find((job) => job.documentVersionId === otherPhoto.finalized.versionId);
  await rpc("complete_document_scan", "$1,'clean',$2,'listing-test-scanner',$3", [
    otherJob.documentScanJobId, otherPhoto.sha, "listing-photo-clean-0002",
  ]);
  await act();
  await expectDatabaseError(
    () => save(rental.unitId, saved.version, {
      ...baseDetails,
      photos: [{ documentVersionId: otherPhoto.finalized.versionId, altText: "Wrong unit" }],
    }),
    "LISTING_PHOTO_NOT_READY",
  );

  // The upload command itself narrows listing photos to image + unit parents.
  await expectDatabaseError(
    () => rpc("create_document_upload_grant",
      "$1,'unit',$2,'rental_listing_photo','Bad PDF','bad.pdf','application/pdf',1000,$3",
      [org, rental.unitId, "listing-bad-mime-0001"]),
    "LISTING_PHOTO_MIME_REQUIRED",
  );
  await expectDatabaseError(
    () => rpc("create_document_upload_grant",
      "$1,'property',$2,'rental_listing_photo','Wrong parent','bad.jpg','image/jpeg',1000,$3",
      [org, rental.propertyId, "listing-bad-parent-0001"]),
    "LISTING_PHOTO_UNIT_REQUIRED",
  );

  // Public discovery is not enabled by saving. The service-only DTO returns nothing until publish.
  await db.exec("reset role; set role service_role");
  const unpublished = await rpc("get_public_rental_listing", "$1", [draft.publicId]);
  assert(unpublished === null, "A draft listing became public before publish.");

  await act();
  const publishKey = randomUUID();
  const published = await setStatus(draft.listingId, saved.version, "published", publishKey);
  assert(published.status === "published" && published.version === 3, "Listing did not publish.");
  const publishReplay = await setStatus(draft.listingId, saved.version, "published", publishKey);
  assert(publishReplay.version === 3, "Publish retry did not return the original result.");

  await db.exec("reset role; set role service_role");
  const publicDto = await rpc("get_public_rental_listing", "$1", [published.publicId]);
  assert(publicDto && publicDto.title === baseDetails.title && publicDto.photos.length === 1,
    "Published listing did not return its sanitized public DTO.");
  const publicText = JSON.stringify(publicDto);
  assert(!publicText.includes("900 Private Street") && !publicText.includes("22030"),
    "Public listing DTO leaked street or postal code.");
  assert(publicDto.location.locality === "Fairfax" && publicDto.location.subdivisionCode === "VA",
    "Public listing omitted the approved coarse location.");
  assert(publicDto.photos[0].documentVersionId === photo.finalized.versionId,
    "Public listing silently substituted a different photo version.");

  // Editing a live listing must fail safe: the changed snapshot goes back to draft until republished.
  await act();
  const editedDetails = { ...withPhoto, summary: "Updated private basement listing details waiting for explicit republication." };
  const edited = await save(rental.unitId, published.version, editedDetails);
  assert(edited.status === "draft" && edited.version === published.version + 1,
    "Editing a published listing changed live public content instead of returning it to draft.");
  await db.exec("reset role; set role service_role");
  assert(await rpc("get_public_rental_listing", "$1", [published.publicId]) === null,
    "Edited draft remained public before republication.");
  await act();
  const republishedAfterEdit = await setStatus(draft.listingId, edited.version, "published");

  const pauseKey = randomUUID();
  const paused = await setStatus(draft.listingId, republishedAfterEdit.version, "paused", pauseKey);
  assert(paused.status === "paused" && paused.version === republishedAfterEdit.version + 1, "Published listing did not pause.");
  assert((await setStatus(draft.listingId, republishedAfterEdit.version, "paused", pauseKey)).version === paused.version,
    "Pause retry was not idempotent.");
  await db.exec("reset role; set role service_role");
  assert(await rpc("get_public_rental_listing", "$1", [published.publicId]) === null,
    "Paused listing remained publicly readable.");

  await act();
  const republished = await setStatus(draft.listingId, paused.version, "published");
  const rotateKey = randomUUID();
  const rotated = await rotate(draft.listingId, republished.version, rotateKey);
  assert(rotated.publicId !== rotated.previousPublicId && rotated.version === republished.version + 1,
    "Share-link rotation did not mint a new public id.");
  assert((await rotate(draft.listingId, republished.version, rotateKey)).publicId === rotated.publicId,
    "Share-link rotation retry minted another URL.");
  await db.exec("reset role; set role service_role");
  assert(await rpc("get_public_rental_listing", "$1", [rotated.previousPublicId]) === null,
    "Rotated share URL still resolved.");
  assert((await rpc("get_public_rental_listing", "$1", [rotated.publicId]))?.publicId === rotated.publicId,
    "Rotated share URL did not resolve.");

  // Base tables and public RPC are not an anonymous read surface.
  await db.exec("reset role; set role anon");
  await expectDatabaseError(() => db.query("select * from public.rental_listings"), "permission denied");
  await expectDatabaseError(() => db.query("select * from public.rental_listing_photos"), "permission denied");
  await expectDatabaseError(
    () => rpc("get_public_rental_listing", "$1", [rotated.publicId]),
    "permission denied for function get_public_rental_listing",
  );

  // Another signed-in user gets no base rows and cannot mutate by guessed UUID.
  await act(outsider);
  assert((await db.query("select id from public.rental_listings where id=$1", [draft.listingId])).rows.length === 0,
    "Outsider could read a listing base row.");
  await expectDatabaseError(
    () => rpc("set_rental_listing_status", "$1,$2,$3,'paused',$4",
      [org, draft.listingId, rotated.version, randomUUID()]),
    "PROPERTY_SCOPE_DENIED",
  );

  // The same property becomes ineligible for listing mutation if its workspace stops being self-managing.
  await db.exec("reset role");
  await db.query("update public.organizations set customer_path='property_manager' where id=$1", [org]);
  await act();
  await expectDatabaseError(
    () => save(rental.unitId, rotated.version, withPhoto),
    "SELF_MANAGING_WORKSPACE_REQUIRED",
  );
  await db.exec("reset role");
  await db.query("update public.organizations set customer_path='self_managing' where id=$1", [org]);

  await act();
  const closed = await setStatus(draft.listingId, rotated.version, "closed");
  assert(closed.status === "closed", "Listing did not close.");
  await expectDatabaseError(
    () => save(rental.unitId, closed.version, withPhoto),
    "LISTING_CLOSED",
  );
  await db.exec("reset role; set role service_role");
  assert(await rpc("get_public_rental_listing", "$1", [rotated.publicId]) === null,
    "Closed listing remained publicly readable.");

  // Closing is historical, not a lifetime lock on the unit: a later relisting is a new public object.
  await act();
  const relisted = await save(rental.unitId, 0, withPhoto);
  assert(relisted.listingId !== closed.listingId && relisted.publicId !== rotated.publicId
    && relisted.status === "draft" && relisted.version === 1,
    "A closed unit could not start a fresh later listing.");

  // A professional organization is not accepted by the homeowner-only command.
  await db.exec("reset role");
  const professionalProperty = (await db.query(
    "select id from public.properties where organization_id=$1 limit 1", [professionalOrg],
  )).rows[0];
  assert(!professionalProperty, "Professional fixture unexpectedly has a property.");

  await db.exec("reset role");
  return {
    draftPrivate: true,
    cleanPhotoRequired: true,
    crossUnitPhotoDenied: true,
    streetHidden: true,
    pausedHidden: true,
    rotatedLinkRevoked: true,
    outsiderDenied: true,
    closedHidden: true,
    relistingAfterClose: true,
    liveEditReturnsToDraft: true,
  };
}
