"""
Helper de fetch com Playwright para sites que bloqueiam clientes HTTP comuns
(Cloudflare/JS-rendering). Mantém um único browser por processo e reusa contexto.

Uso:
    from src.utils.browser_fetch import fetch_html, close_browser

    html = await fetch_html("https://example.com", wait_until="networkidle")
    # ... ao fim do programa:
    await close_browser()
"""
from __future__ import annotations

import asyncio
from typing import Optional

from playwright.async_api import async_playwright, Browser, BrowserContext


_USER_AGENT = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
    "AppleWebKit/537.36 (KHTML, like Gecko) "
    "Chrome/130.0.0.0 Safari/537.36"
)

_lock = asyncio.Lock()
_pw = None
_browser: Optional[Browser] = None
_context: Optional[BrowserContext] = None


async def _ensure_browser() -> BrowserContext:
    """Lazy-init do browser/context (singleton por loop)."""
    global _pw, _browser, _context
    async with _lock:
        if _context is not None:
            return _context
        _pw = await async_playwright().start()
        _browser = await _pw.chromium.launch(
            headless=True,
            args=[
                "--disable-blink-features=AutomationControlled",
                "--no-sandbox",
                "--disable-dev-shm-usage",
            ],
        )
        _context = await _browser.new_context(
            user_agent=_USER_AGENT,
            viewport={"width": 1920, "height": 1080},
            locale="pt-BR",
        )
        # Mascarar webdriver
        await _context.add_init_script(
            "Object.defineProperty(navigator, 'webdriver', {get: () => undefined})"
        )
        return _context


async def fetch_html(
    url: str,
    *,
    wait_until: str = "domcontentloaded",
    timeout_ms: int = 30000,
    wait_selector: Optional[str] = None,
) -> Optional[str]:
    """Busca uma URL e devolve o HTML renderizado. None se falhar."""
    ctx = await _ensure_browser()
    page = await ctx.new_page()
    try:
        await page.goto(url, wait_until=wait_until, timeout=timeout_ms)
        if wait_selector:
            try:
                await page.wait_for_selector(wait_selector, timeout=timeout_ms)
            except Exception:
                pass
        return await page.content()
    except Exception:
        return None
    finally:
        try:
            await page.close()
        except Exception:
            pass


async def close_browser() -> None:
    """Fecha browser/playwright. Idempotente."""
    global _pw, _browser, _context
    async with _lock:
        if _context is not None:
            try:
                await _context.close()
            except Exception:
                pass
            _context = None
        if _browser is not None:
            try:
                await _browser.close()
            except Exception:
                pass
            _browser = None
        if _pw is not None:
            try:
                await _pw.stop()
            except Exception:
                pass
            _pw = None
