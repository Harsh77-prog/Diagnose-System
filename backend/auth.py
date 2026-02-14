"""
Resolve user id from request: either X-User-Id + X-Internal-Secret (Next.js proxy)
or Bearer JWT (NextAuth). Prefer internal secret when present.
"""
from typing import Optional

from fastapi import HTTPException, Request, status
from jose import JWTError, jwt

from config import NEXTAUTH_SECRET, SHARED_SECRET


def get_user_id_from_request(request: Request) -> Optional[str]:
    # Next.js API route forwards with these headers after validating session
    internal = request.headers.get("X-Internal-Secret")
    if SHARED_SECRET and internal and internal == SHARED_SECRET:
        uid = request.headers.get("X-User-Id")
        if uid:
            return uid.strip()

    # Fallback: Bearer JWT (NextAuth)
    auth = request.headers.get("Authorization")
    if auth and auth.startswith("Bearer "):
        token = auth.split(" ", 1)[1].strip()
        if token and NEXTAUTH_SECRET:
            try:
                payload = jwt.decode(
                    token,
                    NEXTAUTH_SECRET,
                    algorithms=["HS256"],
                    options={"verify_aud": False, "verify_iss": False},
                )
                return payload.get("id") or payload.get("sub")
            except JWTError:
                pass
    return None


def require_user_id(request: Request) -> str:
    user_id = get_user_id_from_request(request)
    if not user_id:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or missing authentication",
        )
    return user_id
