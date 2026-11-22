begin;

-- Extend the existing stable RPC without changing its identity, scope, or grants.
create or replace function public.get_organization_closure_readiness(p_organization_id uuid)
returns jsonb
language plpgsql stable security definer
set search_path = ''
as $$
declare
  v_checked_at timestamptz := statement_timestamp();
  v_status public.organization_status;
  v_deposit_tenancies bigint;
begin
  if (select auth.uid()) is null then
    raise exception using errcode='28000',message='AUTHENTICATION_REQUIRED';
  end if;
  if not private.has_unscoped_org_permission(p_organization_id,'organization.manage') then
    raise exception using errcode='42501',message='ORGANIZATION_SCOPE_DENIED';
  end if;
  if coalesce((select auth.jwt()->>'aal'),'aal1')<>'aal2' then
    raise exception using errcode='42501',message='MFA_REQUIRED';
  end if;
  select o.status into strict v_status from public.organizations o where o.id=p_organization_id;

  with obligations as (
    select distinct on (e.tenancy_id) e.tenancy_id,e.amount_minor
    from private.tenancy_deposit_entries e
    where e.organization_id=p_organization_id and e.kind='obligation'
    order by e.tenancy_id,e.version desc
  ), balances as (
    select e.tenancy_id,
      coalesce(sum(e.amount_minor) filter (where e.kind='receipt'),0) as received,
      coalesce(sum(e.amount_minor) filter (where e.kind in ('refund','deduction','other')),0) as disposed
    from private.tenancy_deposit_entries e
    where e.organization_id=p_organization_id and e.kind<>'correction'
      and not exists (
        select 1 from private.tenancy_deposit_entries c
        where c.organization_id=e.organization_id and c.tenancy_id=e.tenancy_id
          and c.kind='correction' and c.target_id=e.id
      )
    group by e.tenancy_id
  )
  select count(*) into v_deposit_tenancies
  from balances b left join obligations o on o.tenancy_id=b.tenancy_id
  where b.received>b.disposed or coalesce(o.amount_minor,0)>b.received;

  return jsonb_build_object(
    'organizationId',p_organization_id,
    'organizationStatus',v_status,
    'checkedAt',v_checked_at,
    'counts',jsonb_build_object(
      'occupiedTenancies',(select count(*) from public.tenancies t where t.organization_id=p_organization_id
        and t.status in ('active','notice_given','move_out_in_progress')),
      'scheduledTenancies',(select count(*) from public.tenancies t where t.organization_id=p_organization_id
        and t.status='scheduled'),
      'pendingAgreements',(select count(*) from private.rental_agreements a where a.organization_id=p_organization_id
        and a.status='open' and a.expires_at>v_checked_at),
      'pendingDocumentSignatures',(select count(*) from public.document_deliveries d
        where d.organization_id=p_organization_id and d.signature_requested_at is not null
          and d.status in ('queued','sent','delivered') and (d.expires_at is null or d.expires_at>v_checked_at)
          and not exists (select 1 from public.document_signatures s where s.organization_id=p_organization_id
            and s.document_delivery_id=d.id and s.signer_user_id=d.recipient_user_id)
          and not exists (select 1 from public.document_acknowledgements a where a.organization_id=p_organization_id
            and a.document_delivery_id=d.id and a.user_id=d.recipient_user_id and a.acknowledgement_type='declined')),
      'residentLedgerPositions',(select count(*) from (
        select 1 from public.journal_entries j
        join public.ledger_accounts a on a.organization_id=j.organization_id
          and a.accounting_book_id=j.accounting_book_id and a.id=j.ledger_account_id
        where j.organization_id=p_organization_id and a.account_code='1100'
        group by j.accounting_book_id,j.receivable_account_id
        having sum(j.debit_minor::numeric-j.credit_minor::numeric)<>0
      ) outstanding),
      'openCharges',(select count(*) from public.charges c where c.organization_id=p_organization_id
        and c.status in ('open','partially_paid')),
      'pendingPayments',(select count(*) from public.payments p where p.organization_id=p_organization_id
        and p.status in ('created','pending')),
      'unreconciledProviderPayments',(select count(*) from public.payments p where p.organization_id=p_organization_id
        and p.payment_source='provider' and p.status in ('succeeded','partially_refunded')
        and p.reconciliation_status<>'reconciled'),
      'unresolvedDepositTenancies',v_deposit_tenancies,
      'pendingRefunds',(select count(*) from public.payment_refunds r where r.organization_id=p_organization_id
        and r.status in ('requested','pending')),
      'openDisputes',(select count(*) from public.payment_disputes d where d.organization_id=p_organization_id
        and d.provider_status in ('warning_needs_response','warning_under_review','needs_response','under_review')),
      'pendingSettlements',(select count(*) from public.settlement_batches b where b.organization_id=p_organization_id
        and (b.provider_status in ('pending','in_transit')
          or (b.provider_status='paid' and b.reconciliation_status<>'reconciled'))),
      'reconciliationExceptions',(select count(*) from public.reconciliation_exceptions e
        where e.organization_id=p_organization_id and e.status in ('open','escalated')),
      'openWorkOrders',(select count(*) from public.work_orders w where w.organization_id=p_organization_id
        and w.status not in ('closed','canceled')),
      'pendingOwnerApprovals',(select count(*) from public.owner_approval_requests r where r.organization_id=p_organization_id
        and r.status='pending'),
      'ownerLedgerPositions',(select count(*) from (
        select 1 from public.journal_entries j
        join public.ledger_accounts a on a.organization_id=j.organization_id
          and a.accounting_book_id=j.accounting_book_id and a.id=j.ledger_account_id
        where j.organization_id=p_organization_id and a.account_code in ('1150','2100')
        group by j.accounting_book_id,j.property_id,j.owner_entity_id,a.account_code
        having sum(j.debit_minor::numeric-j.credit_minor::numeric)<>0
      ) outstanding),
      'openPrivacyRequests',(select count(*) from public.privacy_requests p where p.organization_id=p_organization_id
        and p.status not in ('fulfilled','partially_fulfilled','denied','canceled')),
      'privacyCasesWithHolds',(select count(*) from public.privacy_requests p where p.organization_id=p_organization_id
        and exists (select 1 from private.privacy_request_jobs j where j.privacy_request_id=p.id and j.status='blocked_by_hold'))
    )
  );
end;
$$;
commit;
