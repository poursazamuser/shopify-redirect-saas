import { NextRequest, NextResponse } from 'next/server'

const APP_URL = (process.env.NEXT_PUBLIC_APP_URL || 'https://your-app.railway.app').replace(/\/$/, '')

export async function GET(req: NextRequest) {
  const shopDomain = req.nextUrl.searchParams.get('shop') || ''

  const script = `
(function() {
  'use strict';

  var REDIRECT_API = '${APP_URL}/api/redirect';
  var SHOP_DOMAIN = '${shopDomain}' || window.location.hostname;
  var _redirecting = false;

  // ─── Appel API redirect ───────────────────────────────────────────────────
  function doRedirect(items, fallback) {
    if (_redirecting) return;
    _redirecting = true;

    fetch(REDIRECT_API, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ items: items, shop_domain: SHOP_DOMAIN }),
    })
    .then(function(r) { return r.json(); })
    .then(function(data) {
      if (data.checkoutUrl) {
        window.location.href = data.checkoutUrl;
      } else {
        _redirecting = false;
        if (fallback) fallback();
      }
    })
    .catch(function() {
      _redirecting = false;
      if (fallback) fallback();
    });
  }

  // ─── Récupérer le panier et rediriger ────────────────────────────────────
  function redirectFromCart(fallback) {
    fetch('/cart.js')
      .then(function(r) { return r.json(); })
      .then(function(cart) {
        if (!cart.items || cart.items.length === 0) {
          if (fallback) fallback();
          return;
        }
        var items = cart.items.map(function(item) {
          return { variant_id: String(item.variant_id), quantity: item.quantity };
        });
        doRedirect(items, fallback);
      })
      .catch(function() { if (fallback) fallback(); });
  }

  // ─── Interception navigation vers /checkout ──────────────────────────────
  function interceptCheckoutNavigation() {
    // 1. Intercepter window.location avant navigation
    var _origAssign = window.location.assign.bind(window.location);
    var _origReplace = window.location.replace.bind(window.location);

    function checkUrl(url, fallback) {
      if (url && String(url).indexOf('/checkout') !== -1 && !_redirecting) {
        redirectFromCart(fallback);
        return true;
      }
      return false;
    }

    // 2. Intercepter les liens <a href="/checkout">
    document.addEventListener('click', function(e) {
      var target = e.target;
      while (target && target !== document) {
        if (target.tagName === 'A' && target.href && target.href.indexOf('/checkout') !== -1) {
          e.preventDefault();
          e.stopPropagation();
          redirectFromCart(function() { window.location.href = target.href; });
          return;
        }
        target = target.parentElement;
      }
    }, true);

    // 3. Intercepter les formulaires qui soumettent vers /checkout
    document.addEventListener('submit', function(e) {
      var form = e.target;
      if (form && form.action && form.action.indexOf('/checkout') !== -1) {
        e.preventDefault();
        e.stopPropagation();
        redirectFromCart(function() { form.submit(); });
      }
    }, true);

    // 4. Intercepter history.pushState (SPA navigation)
    var _origPushState = history.pushState.bind(history);
    history.pushState = function(state, title, url) {
      if (url && String(url).indexOf('/checkout') !== -1 && !_redirecting) {
        redirectFromCart(function() { _origPushState(state, title, url); });
        return;
      }
      _origPushState(state, title, url);
    };
  }

  // ─── Variant sélectionné sur page produit ────────────────────────────────
  function getSelectedVariant() {
    var variantInput = document.querySelector('input[name="id"], select[name="id"]');
    if (variantInput && variantInput.value) return variantInput.value;
    if (window.ShopifyAnalytics && window.ShopifyAnalytics.meta && window.ShopifyAnalytics.meta.selectedVariantId) {
      return String(window.ShopifyAnalytics.meta.selectedVariantId);
    }
    return null;
  }

  // ─── Boutons checkout classiques (page panier) ───────────────────────────
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

  // ─── Boutons "Acheter maintenant" (page produit) ─────────────────────────
  function findBuyNowButtons() {
    var selectors = [
      '.shopify-payment-button__button',
      '[data-shopify="payment-button"]',
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
    if (btn._intercepted) return;
    btn._intercepted = true;
    e.preventDefault();
    e.stopPropagation();

    redirectFromCart(function() {
      btn._intercepted = false;
      var form = btn.closest('form');
      if (form) { form.submit(); }
      else if (btn.click) { btn.removeEventListener('click', handleCheckoutClick, true); btn.click(); }
    });
  }

  function handleBuyNowClick(e) {
    var btn = e.currentTarget || e.target;
    var variantId = getSelectedVariant();
    if (!variantId) return;
    if (btn._buyNowIntercepted) return;
    btn._buyNowIntercepted = true;
    e.preventDefault();
    e.stopPropagation();

    doRedirect(
      [{ variant_id: String(variantId), quantity: 1 }],
      function() {
        btn._buyNowIntercepted = false;
        btn.removeEventListener('click', handleBuyNowClick, true);
        btn.click();
      }
    );
  }

  // ─── Attacher les listeners ───────────────────────────────────────────────
  function attachListeners() {
    findCheckoutButtons().forEach(function(btn) {
      if (btn._redirectAttached) return;
      btn._redirectAttached = true;
      var form = btn.closest('form');
      if (form && !form._redirectAttached) {
        form._redirectAttached = true;
        form.addEventListener('submit', function(e) { e.preventDefault(); }, true);
      }
      btn.addEventListener('click', handleCheckoutClick, true);
    });

    findBuyNowButtons().forEach(function(btn) {
      if (btn._buyNowAttached) return;
      btn._buyNowAttached = true;
      btn.addEventListener('click', handleBuyNowClick, true);
    });
  }

  // ─── Init ─────────────────────────────────────────────────────────────────
  function init() {
    interceptCheckoutNavigation();
    attachListeners();

    if (window.MutationObserver) {
      new MutationObserver(function() { attachListeners(); })
        .observe(document.body, { childList: true, subtree: true });
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
