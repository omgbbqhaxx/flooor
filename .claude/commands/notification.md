Send a Base in-app notification to flooor.fun users who have opted in.

When this command is invoked, ask the user for (if not already provided in the same message):
- **Title** (max 30 characters)
- **Message** (max 200 characters)
- **Target path** (optional, defaults to `/`, e.g. `/rewards`)

Then run:

```bash
./scripts/send-notification.sh "<title>" "<message>" "<target_path>"
```

This script reads `BASE_NOTIFICATIONS_API_KEY` from `.env.local`, fetches the list of opted-in users from the Base Dashboard, and sends the notification via the Base Dashboard REST API. Report the `sentCount`/`failedCount` from the response back to the user.

Never print or log the raw API key value.
