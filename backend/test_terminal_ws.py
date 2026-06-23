"""Phase 6 WebSocket smoke test — run with the backend already up on :8080.

Tests:
  1. Missing token  -> 4401
  2. Bad token      -> 4401
  3. Dave (non-member) -> 4403
  4. Alice (member) connects, sends 'echo hello' -> sees output
  5. Bob also connects to same terminal; sees Alice's typed input echoed
"""

from __future__ import annotations

import asyncio
import sys
from pathlib import Path
from urllib.parse import quote

import websockets
from websockets.exceptions import ConnectionClosedError, InvalidStatus


async def expect_close_code(url: str, expected: int, label: str) -> bool:
    """Connect, then verify the server sends a CLOSE frame with `expected`.

    Backend accepts then closes — so connect() succeeds but the close frame
    follows within a few ms. We wait briefly for the close frame and inspect
    its code.
    """
    try:
        ws = await websockets.connect(url)
    except InvalidStatus as exc:
        # Handshake-level rejection (legacy path).
        print(f"  {label}: handshake rejected with status {exc.response.status_code}")
        return False
    except Exception as exc:  # noqa: BLE001
        print(f"  {label}: connect failed {type(exc).__name__}: {exc}")
        return False

    try:
        # Try to receive — the server will send a close frame.
        await asyncio.wait_for(ws.recv(), timeout=2.0)
        print(f"  {label}: UNEXPECTED data before close (wanted close {expected})")
        await ws.close()
        return False
    except ConnectionClosedError as exc:
        if exc.code == expected:
            print(f"  {label}: closed {exc.code} OK ({exc.reason})")
            return True
        print(f"  {label}: closed {exc.code} (wanted {expected})")
        return False
    except asyncio.TimeoutError:
        print(f"  {label}: timed out waiting for close (wanted {expected})")
        await ws.close()
        return False


async def collect_for(ws, timeout: float) -> list[str]:
    out: list[str] = []
    try:
        while True:
            msg = await asyncio.wait_for(ws.recv(), timeout=timeout)
            out.append(msg if isinstance(msg, str) else msg.decode("utf-8", errors="replace"))
    except (asyncio.TimeoutError, ConnectionClosedError):
        pass
    return out


async def main() -> int:
    import os

    tmp = Path(os.environ.get("LOCALAPPDATA", "")) / "Temp"
    term_id = (tmp / "term_id").read_text().strip()
    alice_tok = (tmp / "alice_tok").read_text().strip()
    bob_tok = (tmp / "bob_tok").read_text().strip()
    dave_tok = (tmp / "dave_tok").read_text().strip()

    base = f"ws://localhost:8080/api/ws/terminal/{term_id}"

    print("1) Missing token:")
    no_token_ok = await expect_close_code(base, 4401, "no-token")

    print("2) Bad token:")
    bad_token_ok = await expect_close_code(
        f"{base}?token=garbage", 4401, "bad-token"
    )

    print("3) Dave (non-member):")
    non_member_ok = await expect_close_code(
        f"{base}?token={quote(dave_tok)}", 4403, "non-member"
    )

    print("4) Alice connects, types 'echo hello':")
    alice = await websockets.connect(f"{base}?token={quote(alice_tok)}")
    initial = await collect_for(alice, 3.0)
    has_prompt = any("PS " in chunk for chunk in initial)
    print(f"   initial chunks={len(initial)}, has_prompt={has_prompt}")

    print("5) Bob connects, both should receive Alice's input echo:")
    bob = await websockets.connect(f"{base}?token={quote(bob_tok)}")
    await asyncio.sleep(0.3)
    await collect_for(bob, 0.3)  # drain

    await alice.send("echo hello-from-alice\r")
    await asyncio.sleep(0.6)

    alice_chunks = await collect_for(alice, 0.6)
    bob_chunks = await collect_for(bob, 0.6)

    alice_text = "".join(alice_chunks)
    bob_text = "".join(bob_chunks)
    alice_saw = "hello-from-alice" in alice_text
    bob_saw = "hello-from-alice" in bob_text
    print(f"   alice saw output: {alice_saw}")
    print(f"   bob   saw output: {bob_saw}")

    print("6) Bob types, both see:")
    await bob.send("echo from-bob\r")
    await asyncio.sleep(0.6)
    alice_chunks2 = await collect_for(alice, 0.6)
    bob_chunks2 = await collect_for(bob, 0.6)
    alice_saw2 = "from-bob" in "".join(alice_chunks2)
    bob_saw2 = "from-bob" in "".join(bob_chunks2)
    print(f"   alice saw output: {alice_saw2}")
    print(f"   bob   saw output: {bob_saw2}")

    await alice.close()
    await bob.close()

    # `has_prompt` is informational only — the PTY survives across test runs
    # within a single backend process, so late joiners don't always see a
    # banner. The round-trip checks are what really matter.
    ok = all([
        no_token_ok,
        bad_token_ok,
        non_member_ok,
        alice_saw,
        bob_saw,
        alice_saw2,
        bob_saw2,
    ])
    print(f"\nResult: {'PASS' if ok else 'FAIL'}")
    return 0 if ok else 1


if __name__ == "__main__":
    sys.exit(asyncio.run(main()))
