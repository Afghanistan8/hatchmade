# Hatchmade console

Next.js console over the deployed Hatchmade gate. See the repository
README for the complete documentation set; the app itself is intentionally
small: five routes, reads straight from the Studionet RPC, writes through
whatever wallet the user picks via EIP-6963 discovery.

    npm ci
    npm run dev      # http://localhost:3000
    npm run lint
    npm run build

The contract address defaults to the Studionet deployment recorded in
`../scripts/out/deployment.json`; override with
`NEXT_PUBLIC_HATCHMADE_CONTRACT` (see `.env.example`).

The wallet is never assumed: nothing connects until the user chooses a
wallet from the EIP-6963 announcement list (or the window.ethereum
fallback), and the console verifies the chain is Studionet (61999) before
each write.
