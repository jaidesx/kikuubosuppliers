'use strict';
(() => {
    // Fragments never reach HTTP access logs. Clear the address bar immediately.
    const token = location.hash.slice(1);
    history.replaceState(null, '', location.pathname);
    const $ = id => document.getElementById(id);
    let providers = {}, busy = false, key = null, timer;
    const message = text => { $('status').textContent = text; };
    async function request(action, extra = {}) {
        const response = await fetch('api/v1/payments/', {
            method: 'POST', credentials: 'omit', cache: 'no-store', referrerPolicy: 'no-referrer',
            headers: {'Content-Type': 'application/json'}, body: JSON.stringify({action, token, ...extra})
        });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || 'Payment service unavailable');
        return data;
    }
    function availability() {
        const provider = providers[$('provider').value];
        $('pay').disabled = busy || !provider?.enabled;
        $('availability').textContent = provider?.reason || '';
    }
    function render(order) {
        $('reference').textContent = order.order_reference;
        $('amount').textContent = 'UGX ' + Number(order.amount_ugx).toLocaleString('en-UG');
        const payment = order.payment;
        const paid = order.order_status === 'PAID' && payment?.status === 'SUCCESSFUL' && payment.verified_at;
        const pending = payment && ['CREATED', 'PENDING'].includes(payment.status);
        message(paid ? 'Payment verified. Thank you — your order is paid.' : pending
            ? 'Payment is pending verification. Do not send another payment. Check again shortly.'
            : payment?.status === 'FAILED' && payment.verified_at ? 'Payment failed. Contact the supplier for help.'
            : 'This amount was confirmed by your supplier.');
        $('payment-form').hidden = paid || pending || order.order_status !== 'AWAITING_PAYMENT';
        clearTimeout(timer);
        if (pending) timer = setTimeout(refresh, 15000);
    }
    async function refresh() {
        if (!/^[a-f0-9]{64}$/.test(token)) { message('Open the complete payment link supplied by Kikuubo.'); $('amount').textContent = ''; return; }
        try { const data = await request('status'); providers = data.providers; render(data.order); availability(); }
        catch (error) { message(error.message); $('payment-form').hidden = true; }
    }
    $('provider').addEventListener('change', () => { key = null; availability(); });
    $('phone').addEventListener('input', () => { key = null; });
    $('refresh').addEventListener('click', refresh);
    $('payment-form').addEventListener('submit', async event => {
        event.preventDefault();
        if (busy || !providers[$('provider').value]?.enabled) return;
        busy = true; availability();
        key ||= crypto.randomUUID();
        try { render((await request('initiate', {provider: $('provider').value, phone: $('phone').value.trim(), idempotency_key: key})).order); }
        catch (error) { message(error.message + ' Check status before trying again.'); }
        finally { busy = false; availability(); }
    });
    refresh();
})();
