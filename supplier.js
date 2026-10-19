'use strict';
(() => {
    const $ = id => document.getElementById(id);
    let csrf;
    async function api(action, extra = {}) {
        const r = await fetch('api/v1/supplier/', {method:'POST', cache:'no-store', headers:{'Content-Type':'application/json'}, body:JSON.stringify({action, csrf, ...extra})});
        const data = await r.json();
        if (!r.ok) throw new Error(data.error || 'Request failed');
        return data;
    }
    const status = text => { $('status').textContent = text; };
    async function run(fn) { try { await fn(); } catch(e) { status(e.message); } }
    function element(tag, text, parent) { const el = document.createElement(tag); el.textContent = text; parent.append(el); return el; }
    async function orders() {
        const data = await api('orders');
        $('orders').replaceChildren();
        for (const order of data.orders) {
            const article = element('article', '', $('orders'));
            element('h2', order.order_reference, article);
            element('p', `${order.customer_name} · ${order.customer_phone}\n${order.delivery_location}`, article);
            element('p', `${order.order_status} · Estimate UGX ${order.estimated_subtotal_ugx}\n${order.customer_notes || ''}`, article);
            const detail = element('p', '', article);
            const items = element('button', 'Review order items', article);
            items.onclick = () => run(async () => { detail.textContent = (await api('items', {order_reference:order.order_reference})).items.map(i => `${i.quantity} × ${i.product_name} (${i.requires_quotation ? 'quote required' : 'UGX ' + i.line_total_ugx})`).join('\n'); });
            const label = element('label', 'Final amount in UGX', article);
            const amount = element('input', '', label); amount.type = 'number'; amount.min = '1'; amount.step = '1'; amount.value = order.confirmed_total_ugx || '';
            const approve = element('button', 'Confirm amount and approve', article);
            approve.onclick = () => run(async () => { await api('approve', {order_reference:order.order_reference, amount_ugx:Number(amount.value)}); status('Order approved. Previous payment links were revoked.'); await orders(); });
            const issue = element('button', 'Issue one-hour payment link', article);
            const linkBox = element('p', '', article);
            issue.onclick = () => run(async () => { const data = await api('issue', {order_reference:order.order_reference}); linkBox.replaceChildren(); const a = element('a', 'Open customer payment link', linkBox); a.href = new URL('payment.html', location.href).href + '#' + data.token; a.referrerPolicy = 'no-referrer'; element('p', a.href, linkBox); status('Copy the link privately to the customer. It expires in one hour.'); });
            const revoke = element('button', 'Revoke payment links', article); revoke.className = 'secondary';
            revoke.onclick = () => run(async () => { await api('revoke', {order_reference:order.order_reference}); linkBox.replaceChildren(); status('Links revoked. A payment already sent to the provider still requires reconciliation.'); });
        }
    }
    function signedIn(value) { $('login').hidden = value; $('admin').hidden = !value; }
    $('login').onsubmit = event => { event.preventDefault(); run(async () => { const d = await api('login', {username:$('username').value, password:$('password').value}); csrf = d.csrf; $('password').value = ''; signedIn(true); status('Signed in'); await orders(); }); };
    $('reload').onclick = () => run(orders);
    $('logout').onclick = () => run(async () => { await api('logout'); location.reload(); });
    run(async () => { const r = await fetch('api/v1/supplier/', {cache:'no-store'}); const d = await r.json(); if (!r.ok) throw new Error(d.error); csrf = d.csrf; signedIn(d.authenticated); if (d.authenticated) await orders(); });
})();
