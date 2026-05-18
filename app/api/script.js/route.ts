import { NextRequest, NextResponse } from 'next/server'

const APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'https://your-app.railway.app'

export async function GET(req: NextRequest) {
  const shopDomain = req.nextUrl.searchParams.get('shop') || ''

  const script = `
(function() {
  'use strict';

  var REDIRECT_API = '${APP_URL}/api/redirect';
  var SHOP_DOMAIN = '${shopDomain}' || (window.Shopify && window.Shopify.shop) || window.location.hostname;

  // ─── Capture des click IDs publicitaires ─────────────────────────────────────
  // Lit fbclid, gclid, ttclid, ScCid depuis l'URL ET depuis les cookies
  function getClickIds() {
    var params = new URLSearchParams(window.location.search);
    var ids = {};

    var keys = ['fbclid', 'gclid', 'ttclid', 'ScCid'];
    keys.forEach(function(k) {
      var v = params.get(k);
      if (v) {
        ids[k] = v;
        // Persister en sessionStorage pour les pages suivantes
        try { sessionStorage.setItem('_sb_' + k, v); } catch(e) {}
      } else {
        // Récupérer depuis sessionStorage si déjà capturé sur une page précédente
        try {
          var stored = sessionStorage.getItem('_sb_' + k);
          if (stored) ids[k] = stored;
        } catch(e) {}
      }
    });

    // Facebook stocke aussi _fbc et _fbp en cookie
    try {
      document.cookie.split(';').forEach(function(c) {
        var parts = c.trim().split('=');
        if (parts[0] === '_fbc' && !ids.fbclid) {
          // Extraire le fbclid depuis le cookie _fbc (format: fb.1.timestamp.fbclid)
          var fbcParts = parts[1] && parts[1].split('.');
          if (fbcParts && fbcParts.length >= 4) ids.fbclid = fbcParts.slice(3).join('.');
        }
      });
    } catch(e) {}

    return ids;
  }

  // Capturer les click IDs dès le chargement de la page
  var CLICK_IDS = getClickIds();

  // ─── Détection des boutons checkout ──────────────────────────────────────────
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
        document.querySelectorAll(sel).forEach(function(el) {
          if (found.indexOf(el) === -1) found.push(el);
        });
      } catch(e) {}
    });
    return found;
  }

  // ─── Intercepteur ────────────────────────────────────────────────────────────
  function handleCheckoutClick(e) {
    var btn = e.currentTarget || e.target;
    e.preventDefault();
    e.stopPropagation();

    if (btn._intercepted) return;
    btn._intercepted = true;

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
          body: JSON.stringify({
            items: items,
            shop_domain: SHOP_DOMAIN,
            click_ids: CLICK_IDS,           // ← envoi des click IDs
            page_url: window.location.href,
          }),
        })
        .then(function(r) {
          if (!r.ok) console.warn('[ShopBridge] API error:', r.status);
          return r.json();
        })
        .then(function(data) {
          if (data.checkoutUrl) {
            console.log('[ShopBridge] Redirecting to:', data.checkoutUrl);
            window.location.href = data.checkoutUrl;
          } else {
            console.warn('[ShopBridge] No checkoutUrl:', data.error);
            btn._intercepted = false;
            triggerNativeCheckout(btn);
          }
        });
      })
      .catch(function(err) {
        console.warn('[ShopBridge] Error, native checkout fallback:', err);
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

  function preventFormSubmit(e) { e.preventDefault(); }

  function attachListeners() {
    findCheckoutButtons().forEach(function(btn) {
      if (btn._redirectAttached) return;
      btn._redirectAttached = true;
      var form = btn.closest('form');
      if (form) form.addEventListener('submit', preventFormSubmit, true);
      btn.addEventListener('click', handleCheckoutClick, true);
    });
  }

  function init() {
    attachListeners();
    if (window.MutationObserver) {
      new MutationObserver(attachListeners).observe(document.body, {
        childList: true, subtree: true,
      });
    }
    setInterval(attachListeners, 1500);
  }

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
