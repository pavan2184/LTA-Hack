-- TypeScript canonicalises pairs lexically; enum comparisons use declaration
-- order. Preserve existing rows while aligning the database with the contract.
alter table work_class_incompatibility
  drop constraint work_class_incompatibility_check;

update work_class_incompatibility
set class_a = least(class_a::text collate "C", class_b::text collate "C")::work_class,
    class_b = greatest(class_a::text collate "C", class_b::text collate "C")::work_class;

alter table work_class_incompatibility
  add constraint work_class_incompatibility_lexical_order
  check ((class_a::text collate "C") < (class_b::text collate "C"));
