"""Async Postgres access (asyncpg) over DATABASE_URL.

This is the app's canonical data layer. The pool connects as the `postgres`
role, which bypasses RLS — all authorization is enforced in application code.
"""

import os

import asyncpg

_pool: asyncpg.Pool | None = None


async def init_pool() -> asyncpg.Pool:
    global _pool
    if _pool is None:
        _pool = await asyncpg.create_pool(
            dsn=os.environ["DATABASE_URL"], min_size=1, max_size=10
        )
    return _pool


async def close_pool() -> None:
    global _pool
    if _pool is not None:
        await _pool.close()
        _pool = None


def pool() -> asyncpg.Pool:
    assert _pool is not None, "db pool not initialized"
    return _pool
