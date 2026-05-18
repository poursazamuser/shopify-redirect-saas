import { NextRequest, NextResponse } from 'next/server'

const APP_URL = (process.env.NEXT_PUBLIC_APP_URL || 'https://your-app.railway.app').replace(/\/$/, '')

export async function GET(req: NextRequest) {
  const shopDomain = req.nextUrl.searchParams.get('shop') || ''

  const script = `
(function() {
  'use strict';

  var REDIRECT_API = '${APP_URL}/api/redirect';
  var SHOP_DOMAIN = '${shopDomain}' || window.location.hostname;

  function doRedirect(items) {
    return fetch(REDIRECT_API, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ items: items, shop_domain: SHOP_DOMAIN }),
    })
    .then(function(r) { return r.json(); })
    .then(function(data) { return data.checkoutUrl || null; })
    .catch(function() { return null; });
  }

  function findCheckoutButtons() {
    var selectors = [
      '[name="checkout"]',
      'button[type="submit"][name="checkout"]',
      'input[type="submit"][name="checkout"]',
      'form[action*="/checkout"] button[type="submit"]',
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
        doRedirect(items).then(function(url) {
          if (url) {
            window.location.href = url;
          } else {
            btn._intercepted = false;
            triggerNativeCheckout(btn);
          }
        });
      })
      .catch(function() {
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
    } else {
      btn.removeEventListener('click', handleCheckoutClick, true);
      btn.click();
    }
  }

  function preventFormSubmit(e) { e.preventDefault(); }

  // ─── Product form (buy it now) ───────────────────────────────────────────────
  function findProductForms() {
    return document.querySelectorAll('form[action*="/cart/add"]');
  }

  function getVariantFromForm(form) {
    var input = form.querySelector('input[name="id"], select[name="id"]');
    return input ? input.value : null;
  }

  function handleProductFormSubmit(e) {
    var form = e.currentTarget;
    var submitter = e.submitter;
    var isBuyNow = submitter && (
      submitter.getAttribute('data-buy-now') !== null ||
      (submitter.textContent && /buy.?now|acheter maintenant|payer maintenant/i.test(submitter.textContent.trim()))
    );
    if (!isBuyNow) return;

    var variantId = getVariantFromForm(form);
    var quantity = parseInt((form.querySelector('input[name="quantity"]') || {}).value) || 1;
    if (!variantId) return;

    e.preventDefault();
    e.stopPropagation();

    doRedirect([{ variant_id: String(variantId), quantity: quantity }]).then(function(url) {
      if (url) {
        window.location.href = url;
      } else {
        form.removeEventListener('submit', handleProductFormSubmit, true);
        form.submit();
      }
    });
  }

  // ─── Attach all listeners ────────────────────────────────────────────────────
  function attachListeners() {
    findCheckoutButtons().forEach(function(btn) {
      if (btn._redirectAttached) return;
      btn._redirectAttached = true;
      var form = btn.closest('form');
      if (form) form.addEventListener('submit', preventFormSubmit, true);
      btn.addEventListener('click', handleCheckoutClick, true);
    });

    findProductForms().forEach(function(form) {
      if (form._productFormAttached) return;
      form._productFormAttached = true;
      form.addEventListener('submit', handleProductFormSubmit, true);
    });
  }

  // ─── Re-init on SPA navigation (Shopify uses history.pushState) ──────────────
  function init() {
    attachListeners();
    if (window.MutationObserver) {
      new MutationObserver(function() { attachListeners(); })
        .observe(document.body, { childList: true, subtree: true });
    }
    setInterval(attachListeners, 1000);
  }

  // Patch history.pushState pour détecter les navigations SPA
  var _origPushState = history.pushState;
  history.pushState = function() {
    _origPushState.apply(this, arguments);
    setTimeout(attachListeners, 300);
    setTimeout(attachListeners, 800);
  };

  window.addEventListener('popstate', function() {
    setTimeout(attachListeners, 300);
  });

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  window._shopBridgeLoaded = true;
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
