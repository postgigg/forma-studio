# Work together

Forma 1.10 adds opt-in, host-led collaboration to the desktop editor. Both computers need a compatible Forma desktop version and a reachable private IPv4 network. This first version uses Wi-Fi, Ethernet or an already configured private VPN; it does not add Bluetooth pairing or automatic internet connections.

1. Open a design and click **Work together** in the top bar.
2. Enter your display name, choose the private network interface, and click **Start live session**.
3. Copy the invitation and send it privately. The other person opens **Work together → Join with a code**, enters a display name, pastes it, and requests access.
4. The host sees the request and chooses **Can view**, **Can comment**, or **Can edit** before allowing it. There can be up to eight guests.
5. Close the sharing dialog to work. The session bar opens the existing Comments panel or session controls. Colored cursors and selection borders show other participants' activity on the same page.
6. The host can change permissions, remove someone, renew the invitation, or end the session. Guests can leave. Opening another design ends or leaves the current session first.

Invitations expire after ten minutes. Renewing one invalidates outstanding invitations and waiting requests; connected participants remain connected. The code includes a private network address and certificate fingerprint, so it is longer than a six-digit discovery code. There is no Forma directory resolving short codes. Treat an invitation as private even though each new participant also needs host approval. Display names are chosen by participants, not verified accounts.

## What is shared

Only the open design is sent: its pages, artwork, embedded images and audio, used custom fonts, and comments. The guest gets a separate local design ID, so an existing design with the host's ID is not overwritten. Personal brand/style profiles, campaigns and folder associations, AI instructions and account settings, other projects, cloud credentials, and thumbnails are excluded. Shared comments have authors and resolution state and continue to use the existing object attachments and export behavior.

Changes to different objects and different properties merge. The host serializes updates. If two people change the same property from an old value, the first accepted value is kept and the other person sees a conflict message; their independent changes still apply. Group contents, images, object order, pages, and comments sync through the same design model. Shared undo reverses only your accepted operations and checks current values, preserving independent edits by others.

Both computers save local copies through Forma's existing storage. Ending access stops future updates; it does not retract copies already received. The host must stay open. Brief connection losses retry for up to 45 seconds and catch up from acknowledged events or a fresh snapshot. After a longer loss, the session ends and the local copy remains editable. This is connected collaboration, not automatic merging of separately edited offline copies.

## Connection and privacy

The native app starts a separate HTTPS service only when hosting, bound to the selected private network address and a temporary port. It uses TLS 1.3 with a fresh P-256 certificate. The invitation pins that certificate's SHA-256 fingerprint; the guest checks it before HTTP headers, invitation credentials, or artwork are sent. No CA certificate is installed. The host approves requests and issues independent random session tokens; roles are enforced by the host, not just hidden controls.

No collaboration document traffic, invitation directory, STUN service, TURN relay, or storage is run by Forma. The public website and payment service are not involved. The existing editor and AI API remain bound to loopback with their existing origin/session protections and CSP. Collaboration IPC uses the same main-frame and origin checks as the other desktop operations. Network requests cannot invoke the AI, cloud, file export, or desktop capture APIs.

Windows may ask whether Forma can receive connections on a private network. Some guest Wi-Fi networks isolate devices. Choose the reachable interface; if devices cannot reach each other, use another trusted LAN or an existing private VPN. The feature does not automatically configure firewall rules, routers, VPNs, public ports, or internet relays. A shared design is limited to 64 MB, 100 pages, and the editor's normal canvas/object limits.

## Verification

`npm run test:collaboration` exercises property conflicts, parallel additions, shared undo, author enforcement, invalid data, certificate mismatch, encrypted native peer traffic, admission, permissions, renewal and removal. It then opens two isolated real editor workspaces through test-supplied native bridges and verifies concurrent edits, rapid updates, nested groups, embedded images, comments and resolution, permission rollback, page changes, selection presence, and saved-copy recovery. The browser bridge and editor inspection hooks exist only in the test response. The network test uses loopback; physical multi-computer Wi-Fi and firewall behavior require testing on those networks.
