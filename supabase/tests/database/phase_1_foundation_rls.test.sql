begin;
select plan(5);

select has_table('public','organizations','organizations exists');
select has_table('private','idempotency_records','idempotency persistence exists');
select policies_are('public','organizations',array['organizations_member_read'],'organizations are member-scoped');
select policies_are('public','accounting_books',array['accounting_books_member_read'],'books are member-scoped');
select function_privs_are(
  'public','create_organization',
  array['text','text','text','character','text','text','text','text'],
  'authenticated',array['EXECUTE'],
  'only authenticated callers receive the command grant'
);

select * from finish();
rollback;
