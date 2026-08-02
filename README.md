# GrandPerspective — PDS edition

See where an atproto repo's bytes actually go, then act on what you find.

Enter any handle or DID and the tool reads that repo in full, straight from its
PDS in your browser, and draws it as a treemap: one cell per record, area
proportional to the bytes it actually occupies. Sign in with your own atproto
account and you can edit or delete your own records.

Everything runs client-side. There is no server, no proxy, and no credential
ever leaves your browser — public repo reads need no authentication at all, and
writes use atproto OAuth.

## Development

    npm install
    npm run dev      # binds 127.0.0.1 — required for the OAuth loopback client
    npm test
    npm run build

## Credits

Made by [@pixeline.be](https://bsky.app/profile/pixeline.be).

The treemap concept and the name come from
[**GrandPerspective**](https://grandperspectiv.sourceforge.net/) by Erwin
Bonsma — a disk usage visualiser for macOS, released under the GPL. This project
is an independent work applying the same idea to atproto repositories. It is not
a port of GrandPerspective and is not affiliated with it.
