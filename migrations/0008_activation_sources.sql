-- One device can report more than one id. They share the code from the first source that registered.

alter table activation_devices add column if not exists source text not null default 'android';
alter table activation_devices add column if not exists primary_device_id text;

update activation_devices
set primary_device_id = device_id
where primary_device_id is null or primary_device_id = '';

drop index if exists activation_devices_code_idx;
