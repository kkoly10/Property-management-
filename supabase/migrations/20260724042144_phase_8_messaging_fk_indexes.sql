begin;

create index conversations_created_by_idx
  on public.conversations(created_by)
  where created_by is not null;

create index conversation_participants_last_read_message_fk_idx
  on public.conversation_participants(last_read_message_id)
  where last_read_message_id is not null;

commit;
