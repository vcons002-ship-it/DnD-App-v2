# Whispers and Party chat

In the existing Chat panel, use **To** to choose **Everyone**, an individual player, or **DM**. Players also have **Party (players only)**. Recipients need to claim their characters so they appear in the list. Click **Reply** on a private message to select its conversation again.

Whispers appear only for the participants. Party chat appears for players and is excluded from the DM's chat. Neither channel creates speech or typing bubbles on the map, and private messages are excluded from the shared AI recap.

Choose a private channel, then **Attach image** to send a PNG, JPEG, WebP or GIF up to 10 MB. You can preview and remove an attachment before sending. Received images stay as thumbnails until clicked; the viewer supports fitting the image or showing its full size. Dice and AI commands use Everyone chat; rejected private commands preserve the draft.

The server fixes a whisper's audience at send time. A different player claiming the same character later does not inherit that player's private history. **Reply** stays bound to the original conversation until you manually choose a different recipient, so a reassigned character cannot redirect an old private reply. Party history is shared with players who join the campaign.

Images are stored on the host in its data folder's `private-chat-images` directory, outside public uploads, and included in campaign backups. They are fetched with an authenticated connection credential; the credential is never included in the image URL. Imported DM-participating whispers remain DM archives, while imported player-only conversations are not assigned to new players.

These are app visibility controls. The person administering the server can access its files and database, including backup data.

# Hidden doors

The DM can click a hidden door's dimmed marker, or select it in the Walls panel, and open or close it remotely. Finish wall drawing or editing first to use the map marker controls. Unlock locked doors before opening, and move tokens clear before closing.

Players never receive a hidden door's marker. Closed doors still block sight and movement. Opening one removes those blocks while retaining its hidden status. On a normally lit map, players see through the opening as far as unobstructed sight allows. In darkness, torch/lantern light and each character's darkvision still determine what becomes visible.
