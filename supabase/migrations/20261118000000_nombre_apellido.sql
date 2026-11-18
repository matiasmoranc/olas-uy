-- Los fotógrafos se muestran con nombre y apellido (genera confianza en los compradores).
-- "not valid": no revisa los perfiles que ya existen (el sitio les pide el apellido al entrar a Vender),
-- pero sí cada alta nueva y cada cambio de nombre.
alter table public.photographers
  add constraint photographers_nombre_apellido check (name ~ '^\S+(\s+\S+)+$') not valid;
