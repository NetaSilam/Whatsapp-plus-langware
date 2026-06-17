"""Seed 3 demo users + sample conversations for the interview demo.

Run after `supabase db reset` (clean DB), with the backend running on :8080:
    .venv/Scripts/python.exe seed_demo.py

Creates Alice, Bob, Carol, a 1:1 Alice<->Bob chat with a few messages, and a
"Team Chatter" group (Alice is manager) with a welcome message. Each user logs
in with their phone number; the on-screen OTP is shown at login time.
"""

import asyncio

import httpx

B = "http://localhost:8080"

USERS = [
    {"phone": "+15550000001", "username": "Alice"},
    {"phone": "+15550000002", "username": "Bob"},
    {"phone": "+15550000003", "username": "Carol"},
]


async def login(c: httpx.AsyncClient, phone: str, username: str) -> str:
    otp = (await c.post(f"{B}/api/auth/request-otp", json={"phone": phone, "username": username})).json()
    user = (await c.post(f"{B}/api/auth/verify", json={"phone": phone, "code": otp["dev_code"]})).json()
    return user["id"]


async def main():
    clients = {}
    ids = {}
    for u in USERS:
        c = httpx.AsyncClient()
        ids[u["username"]] = await login(c, u["phone"], u["username"])
        clients[u["username"]] = c
        print(f"  user: {u['username']} ({u['phone']}) -> {ids[u['username']]}")

    alice = clients["Alice"]

    # 1:1 Alice <-> Bob with a short exchange.
    direct = (await alice.post(f"{B}/api/conversations/direct", json={"peer_id": ids["Bob"]})).json()
    did = direct["id"]
    await alice.post(f"{B}/api/conversations/{did}/messages", json={"body": "Hey Bob! Ready for the demo? 👋"})
    await clients["Bob"].post(f"{B}/api/conversations/{did}/read", json={})
    await clients["Bob"].post(f"{B}/api/conversations/{did}/messages", json={"body": "Absolutely — let's go!"})
    print(f"  direct chat: {did}")

    # Group with all three; Alice is the manager.
    group = (
        await alice.post(
            f"{B}/api/conversations/group",
            json={"name": "Team Chatter", "member_ids": [ids["Bob"], ids["Carol"]]},
        )
    ).json()
    gid = group["id"]
    await alice.post(f"{B}/api/conversations/{gid}/messages", json={"body": "Welcome to the team group! Try the shared terminal 👉"})
    print(f"  group: {gid}")

    for c in clients.values():
        await c.aclose()
    print("\nSeed complete. Log in with these phone numbers (OTP shown on screen):")
    for u in USERS:
        print(f"  {u['username']}: {u['phone']}")


asyncio.run(main())
