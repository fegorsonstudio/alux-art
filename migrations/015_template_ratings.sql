-- Star ratings for templates
alter table templates
  add column if not exists avg_rating numeric(3,2),
  add column if not exists rating_count integer not null default 0;

create table if not exists template_ratings (
  id           uuid        primary key default gen_random_uuid(),
  template_id  uuid        not null references templates(id) on delete cascade,
  user_id      uuid        not null references auth.users(id) on delete cascade,
  rating       integer     not null check (rating >= 1 and rating <= 5),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  unique(template_id, user_id)
);

alter table template_ratings enable row level security;

create policy "Anyone can read ratings"
  on template_ratings for select using (true);

create policy "Authenticated users can submit ratings"
  on template_ratings for insert
  with check (auth.uid() = user_id);

create policy "Users can update their own ratings"
  on template_ratings for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- Keep avg_rating in sync automatically
create or replace function sync_template_avg_rating()
returns trigger language plpgsql security definer as $$
declare
  tid uuid := coalesce(new.template_id, old.template_id);
begin
  update templates set
    avg_rating   = (select round(avg(rating)::numeric, 2) from template_ratings where template_id = tid),
    rating_count = (select count(*)                       from template_ratings where template_id = tid)
  where id = tid;
  return coalesce(new, old);
end;
$$;

drop trigger if exists trg_sync_template_rating on template_ratings;
create trigger trg_sync_template_rating
  after insert or update or delete on template_ratings
  for each row execute function sync_template_avg_rating();

-- USD support on purchases
alter table template_purchases
  add column if not exists currency   text           not null default 'NGN',
  add column if not exists amount_usd numeric(10,2);
