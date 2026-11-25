# Notification inbox filters

Pure presentation filtering for already recipient-scoped notification records:

- all, unread, or read states;
- related entity type: offer, logistics request, or sale;
- case-insensitive search over notification identifiers, related entity identifiers, type, and timestamp.

Server/database authorization must happen before this helper. It does not authorize access, fetch data, mutate persistence, or change records.
