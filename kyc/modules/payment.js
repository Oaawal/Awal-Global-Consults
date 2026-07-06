/**
 * MODULE: Payment Summary Screen
 */
(function () {
  const R = AGC_Renderer;

  AGC_Router.register('payment', {

    render(state) {
      const { step, total } = AGC_Router.stepInfo();
      const PAY = window.AGC_PAYMENT || {};
      const SVCS = window.AGC_SERVICES || [];
      const selected = state.selectedServices || [];
      const tiers = state.tiers || {};

      // Build price lines
      let grandTotal = 0;
      let hasQuote = false;
      let minDeposit = 0;
      let depositPercents = [];

      const lines = selected.map(id => {
        const svc  = SVCS.find(s => s.id === id) || { name: id };
        const pCfg = (PAY.services || {})[id];

        if (!pCfg || pCfg.type === 'quote') {
          hasQuote = true;
          return { name: svc.name, amount: null, label: 'Quote required', deposit: null };
        }

        if (pCfg.type === 'fixed') {
          grandTotal += pCfg.price;
          depositPercents.push(pCfg.deposit || 50);
          return { name: svc.name, amount: pCfg.price, label: `₦${pCfg.price.toLocaleString()}`, deposit: pCfg.deposit || 50 };
        }

        if (pCfg.type === 'tiered') {
          const tierIdx = tiers[id] || 0;
          const tier = pCfg.tiers ? pCfg.tiers[tierIdx] : (pCfg.options || [])[tierIdx];
          if (!tier) { hasQuote = true; return { name: svc.name, amount: null, label: 'Quote required', deposit: null }; }
          grandTotal += tier.price;
          depositPercents.push(pCfg.deposit || 50);
          return { name: svc.name, amount: tier.price, label: `₦${tier.price.toLocaleString()} — ${tier.label}`, deposit: pCfg.deposit || 50 };
        }

        if (pCfg.type === 'milestone') {
          hasQuote = true;
          return { name: svc.name, amount: null, label: 'Custom milestone pricing', deposit: pCfg.deposit || 50, milestone: true };
        }

        hasQuote = true;
        return { name: svc.name, amount: null, label: 'Quote required', deposit: null };
      });

      // Minimum deposit = highest deposit % among fixed-price services
      const maxDepositPct = depositPercents.length > 0 ? Math.max(...depositPercents) : 50;
      minDeposit = grandTotal > 0 ? Math.ceil(grandTotal * maxDepositPct / 100) : 0;

      const totalLabel = hasQuote && grandTotal === 0
        ? 'To be quoted'
        : hasQuote
          ? `₦${grandTotal.toLocaleString()} + items to quote`
          : `₦${grandTotal.toLocaleString()}`;

      const depositLabel = minDeposit > 0
        ? `Minimum deposit to begin: ₦${minDeposit.toLocaleString()} (${maxDepositPct}%)`
        : '';

      // Store total in hidden field
      setTimeout(() => {
        const hTotal = document.getElementById('h-total');
        if (hTotal) hTotal.value = totalLabel + ' — ' + selected.map(id => {
          const s = SVCS.find(x => x.id === id); return s ? s.name : id;
        }).join(', ');
      }, 50);

      return `
        <div class="agc-card">
          <div class="agc-card-head">
            <div class="agc-card-num">${step}</div>
            <div>
              <div class="agc-card-title">Payment Summary</div>
              <div class="agc-card-sub">Review your services and make payment before submitting</div>
            </div>
          </div>
          <div class="agc-card-body">

            <!-- Price breakdown -->
            <div class="agc-price-card">
              <div class="agc-price-title">Services & Pricing</div>
              ${lines.map(line => `
                <div class="agc-price-line">
                  <span class="agc-price-svc">${line.name}</span>
                  ${line.amount !== null
                    ? `<span class="agc-price-amt">${line.label}</span>`
                    : `<span class="agc-price-quote">${line.label}</span>`}
                </div>`).join('')}
              <div class="agc-price-total">
                <span class="agc-price-total-label">Estimated Total</span>
                <span class="agc-price-total-amt">${totalLabel}</span>
              </div>
              ${depositLabel ? `<div class="agc-deposit-note">💡 ${depositLabel}</div>` : ''}
              ${hasQuote ? `<div class="agc-deposit-note">Items marked "Quote required" will be confirmed by our team within 1 working day.</div>` : ''}
            </div>

            <!-- Payment options -->
            <div class="agc-sec-label" style="margin-top:20px;">How to Pay</div>
            <div class="agc-payment-grid">

              <div class="agc-payment-card">
                <div class="agc-payment-title">🏦 Bank Transfer</div>
                <div class="agc-payment-body">
                  <strong>${PAY.bank ? PAY.bank.name : 'Awal Global Consults Limited'}</strong><br>
                  ${PAY.bank ? PAY.bank.bank : 'KudaBank'}<br>
                  <div class="agc-payment-acct">${PAY.bank ? PAY.bank.account : '3003466189'}</div>
                  <span style="font-size:11px;color:var(--muted);">Use your full name as narration</span>
                </div>
              </div>

              <div class="agc-payment-card agc-payment-online">
                <div class="agc-payment-title">💳 Pay Online</div>
                <a href="${PAY.paystack ? PAY.paystack.link : 'https://paystack.shop/pay/awalglobal'}"
                  target="_blank" rel="noopener" class="agc-paystack-btn">
                  Pay with Paystack ↗
                </a>
                <span style="font-size:11px;color:var(--muted);margin-top:4px;">Card, bank transfer, USSD</span>
              </div>

            </div>

            ${R.notice(`✅ After payment, send your proof of payment to <strong>${PAY.whatsapp || '+234 703 833 6596'}</strong> on WhatsApp with your full name and the service you paid for.`, 'green')}

            <div class="agc-field-row one" style="margin-top:16px;">
              <div class="agc-field">
                <label for="pay_ref">Payment Reference / Receipt Number <span class="agc-opt">(if already paid)</span></label>
                <input type="text" id="pay_ref" name="Payment_Reference"
                  placeholder="e.g. bank transaction ID or Paystack reference"/>
                <span class="agc-field-hint">Leave blank if you haven't paid yet — you can pay after submitting.</span>
              </div>
            </div>

          </div>
          ${R.navBar({ step, total, onNext:'AGC_Router.next()', onBack:'AGC_Router.back()' })}
        </div>`;
    },

    validate() { return true; } // Payment is not mandatory before submission
  });

})();