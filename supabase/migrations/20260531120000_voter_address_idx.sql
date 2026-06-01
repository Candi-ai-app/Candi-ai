-- CANDI — household grouping index.
--
-- Supports the Voters detail card's "others at this address" (household) lookup:
-- given a selected voter's address, find the OTHER voters at that exact address
-- within the same campaign (see getHousehold in app/(app)/voters/actions.ts).
--
-- ~66% of voters share an address with another voter, so this lookup runs often;
-- a (campaign_id, address) btree keeps it index-served instead of a full scan.
--
-- Idempotent.

create index if not exists voters_campaign_address_idx on public.voters (campaign_id, address);
