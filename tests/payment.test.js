/** @jest-environment jsdom */
const fs = require('fs');
const path = require('path');
const script = fs.readFileSync(path.join(__dirname, '../payment.js'), 'utf8');
const html = fs.readFileSync(path.join(__dirname, '../payment.html'), 'utf8');
const flush = () => new Promise(resolve => setTimeout(resolve, 0));
const token = 'a'.repeat(64);
function response(order, enabled = false) {
    return {ok:true, json:async () => ({order, providers:{mtn:{enabled, reason:'Awaiting onboarding'}, airtel:{enabled:false}}})};
}
const order = {order_reference:'TEST-1', amount_ugx:12500, order_status:'AWAITING_PAYMENT', payment:null};
beforeEach(() => {
    document.documentElement.innerHTML = html;
    history.replaceState(null, '', '/payment.html#' + token);
    global.fetch = jest.fn();
});
afterEach(() => { jest.restoreAllMocks(); });
test('token is removed from URL and sent only in a same-origin POST body', async () => {
    fetch.mockResolvedValue(response(order));
    window.eval(script); await flush();
    expect(location.hash).toBe('');
    const [url, options] = fetch.mock.calls[0];
    expect(url).toBe('api/v1/payments/');
    expect(JSON.parse(options.body).token).toBe(token);
    expect(options.referrerPolicy).toBe('no-referrer');
    expect(options.credentials).toBe('omit');
    expect(document.getElementById('amount').textContent).toContain('12,500');
    expect(document.getElementById('pay').disabled).toBe(true);
});
test('successful status without backend verification never displays paid', async () => {
    fetch.mockResolvedValue(response({...order, order_status:'PAID', payment:{status:'SUCCESSFUL', verified_at:null}}));
    window.eval(script); await flush();
    expect(document.getElementById('status').textContent).not.toContain('order is paid');
});
test('verified settlement displays paid and hides payment form', async () => {
    fetch.mockResolvedValue(response({...order, order_status:'PAID', payment:{status:'SUCCESSFUL', verified_at:'2026-01-01 12:00:00'}}));
    window.eval(script); await flush();
    expect(document.getElementById('status').textContent).toContain('order is paid');
    expect(document.getElementById('payment-form').hidden).toBe(true);
});
test('revoked or expired links hide the form and display the safe error', async () => {
    fetch.mockResolvedValue({ok:false, json:async () => ({error:'Payment link unavailable'})});
    window.eval(script); await flush();
    expect(document.getElementById('payment-form').hidden).toBe(true);
    expect(document.getElementById('status').textContent).toBe('Payment link unavailable');
});
test('backend-confirmed failure is shown as failed', async () => {
    fetch.mockResolvedValue(response({...order, payment:{status:'FAILED', verified_at:'2026-01-01 12:00:00'}}));
    window.eval(script); await flush();
    expect(document.getElementById('status').textContent).toContain('Payment failed');
});
