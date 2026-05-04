-- Fix match_knowledge_nodes to allow public access via security definer
create or replace function match_knowledge_nodes(
  query_embedding vector(768),
  p_org_id uuid,
  match_threshold float default 0.50,
  match_count int default 5
)
returns table (
  id uuid, title text, content text, source_type text, similarity float
)
language plpgsql
security definer -- This allows the function to bypass RLS safely
as $$
begin
  return query
  select kn.id, kn.title, kn.content, kn.source_type,
         1 - (kn.embedding <=> query_embedding) as similarity
  from   knowledge_nodes kn
  where  kn.org_id = p_org_id
    and  1 - (kn.embedding <=> query_embedding) > match_threshold
  order  by kn.embedding <=> query_embedding
  limit  match_count;
end;
$$;
