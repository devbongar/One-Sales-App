-- Restore execute grants lost when the function was dropped and recreated.

grant execute on function public.generate_penalty_lines(date) to authenticated;
grant execute on function public.generate_penalty_lines(date) to anon;
