-- Parenthesize JSON extraction before subtraction: '-' binds more tightly than
-- '->'. Preserve the applied migration and change only this function expression.
do $$
declare definition text;
begin
 definition:=pg_get_functiondef('railplan_private.mutate_coordination_case(uuid,jsonb,jsonb,uuid)'::regprocedure);
 if position('run.result-''solveMs''=p.payload->''result''-''solveMs''-''plan''' in definition)=0 then
  raise exception 'Expected coordination comparison was not found';
 end if;
 execute replace(definition,
  'run.result-''solveMs''=p.payload->''result''-''solveMs''-''plan''',
  '(run.result - ''solveMs'') = ((p.payload->''result'') - ''solveMs'' - ''plan'')');
end $$;
