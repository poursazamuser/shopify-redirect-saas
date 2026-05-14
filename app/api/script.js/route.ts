import { NextRequest, NextResponse } from 'next/server'

const APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'https://your-app.railway.app'

// GET /api/script.js – Served to Shopify store A via <script> tag
// The merchant adds: <script src="https://your-app.railway.app/api/script.js"></script>
// to the theme.liquid of store A
export async function GET(req: NextRequest) {
  const shopDomain = req.nextUrl.searchParams.get('shop') || ''

  const script = `
(function() {
  'use strict';

  var REDIRECT_API = '${APP_URL}/api/redirect';
  var SHOP_DOMAIN = '${shopDomain}' || window.Shopify && window.Shopify.shop || window.location.hostname;

  // ─── Robust checkout button detection ───────────────────────────────────────
  function findCheckoutButtons() {
    var selectors = [
      '[name="checkout"]',
      'button[type="submit"][name="checkout"]',
      'input[type="submit"][name="checkout"]',
      'form[action*="/checkout"] button[type="submit"]',
      'form[action*="/checkout"] input[type="submit"]',
      '.cart__checkout-button',
      '.cart-checkout-btn',
      '.checkout-button',
      '#checkout',
      '[data-checkout-button]',
      'button.btn--checkout',
      'a[href*="/checkout"]',
    ];

    var found = [];
    selectors.forEach(function(sel) {
      try {
        var els = document.querySelectorAll(sel);
        els.forEach(function(el) {
          if (found.indexOf(el) === -1) found.push(el);
        });
      } catch(e) {}
    });
    return found;
  }

  // ─── Intercept handler ───────────────────────────────────────────────────────
  function handleCheckoutClick(e) {
    var btn = e.currentTarget || e.target;

    // If it's a plain link to checkout, let it go if we fail
    var isLink = btn.tagName === 'A';

    e.preventDefault();
    e.stopPropagation();

    if (btn._intercepted) return;
    btn._intercepted = true;

    // Fetch current cart
    fetch('/cart.js')
      .then(function(r) { return r.json(); })
      .then(function(cart) {
        if (!cart.items || cart.items.length === 0) {
          btn._intercepted = false;
          triggerNativeCheckout(btn);
          return;
        }

        var items = cart.items.map(function(item) {
          return { variant_id: String(item.variant_id), quantity: item.quantity };
        });

        return fetch(REDIRECT_API, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ items: items, shop_domain: SHOP_DOMAIN }),
        })
        .then(function(r) {
          if (!r.ok) {
            console.warn('[ShopBridge] Redirect API error:', r.status, r.statusText);
          }
          return r.json();
        })
        .then(function(data) {
          if (data.checkoutUrl) {
            console.log('[ShopBridge] Redirecting to:', data.checkoutUrl);
            window.location.href = data.checkoutUrl;
          } else {
            console.warn('[ShopBridge] No checkoutUrl returned:', data.error);
            btn._intercepted = false;
            triggerNativeCheckout(btn);
          }
        });
      })
      .catch(function(err) {
        // Fail → native Shopify checkout (CORS, réseau, etc.)
        console.warn('[ShopBridge] Caught error, falling back to native checkout:', err);
        btn._intercepted = false;
        triggerNativeCheckout(btn);
      });
  }

  function triggerNativeCheckout(btn) {
    var form = btn.closest('form');
    if (form) {
      form.removeEventListener('submit', preventFormSubmit, true);
      form.submit();
    } else if (btn.tagName === 'A' && btn.href) {
      window.location.href = btn.href;
    } else if (btn.click) {
      btn.removeEventListener('click', handleCheckoutClick, true);
      btn.click();
    }
  }

  // Prevent form submission to handle it ourselves
  function preventFormSubmit(e) {
    e.preventDefault();
  }

  // ─── Attach listeners ────────────────────────────────────────────────────────
  function attachListeners() {
    var buttons = findCheckoutButtons();
    buttons.forEach(function(btn) {
      if (btn._redirectAttached) return;
      btn._redirectAttached = true;

      var form = btn.closest('form');
      if (form) {
        form.addEventListener('submit', preventFormSubmit, true);
      }

      btn.addEventListener('click', handleCheckoutClick, true);
    });
  }

  // ─── Observe DOM for dynamic themes (React/Ajax carts) ──────────────────────
  function init() {
    attachListeners();

    // MutationObserver for Ajax/dynamic carts (Dawn, etc.)
    if (window.MutationObserver) {
      var observer = new MutationObserver(function() {
        attachListeners();
      });
      observer.observe(document.body, { childList: true, subtree: true });
    }

    // Fallback interval for themes that rebuild DOM
    setInterval(attachListeners, 1500);
  }

  // ─── Bootstrap ──────────────────────────────────────────────────────────────
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
`.trim()

  return new NextResponse(script, {
    headers: {
      'Content-Type': 'application/javascript; charset=utf-8',
      'Cache-Control': 'public, max-age=60',
      'Access-Control-Allow-Origin': '*',
    },
  })
}
