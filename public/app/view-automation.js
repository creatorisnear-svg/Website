// Automation tab: pair Claude in Chrome with this system, watch what it has
// prepared, and press send on the messages you approve.

import {
  el, api, toast, modal, confirmDialog, field, input, card, table, emptyState,
  clear, copyText, relTime, dateFmt, scoreBadge,
} from './lib.js';

export async function renderAutomation(root, ctx) {
  clear(root);
  const [{ token, status }, { actions }] = await Promise.all([
    api.get('/api/automation/token'),
    api.get('/api/automation/actions'),
  ]);

  const prepared = actions.filter((a) => a.status === 'prepared');
  // Highest priority first, matching the order Claude is actually served them.
  const pending = actions
    .filter((a) => a.status === 'pending')
    .sort((a, b) => (b.priority || 0) - (a.priority || 0));
  const recent = actions.filter((a) => a.status === 'done' || a.status === 'skipped').slice(0, 15);

  // ---- how it works -----------------------------------------------------
  root.appendChild(el('div.note', { html:
    '<strong>Claude prepares, you send.</strong> Claude collects comments off your posts, researches buyers, ' +
    'drafts your posts, and types each message into the right conversation — then stops. You read it and press send. ' +
    'That keeps every message human-approved, which is what keeps the account out of trouble.' }));

  // ---- status strip ------------------------------------------------------
  root.appendChild(el('div.kpis', {}, [
    el(`div.kpi.${prepared.length ? 'accent-gold' : ''}`, {}, [
      el('div.kpi-label', { text: 'Ready for you to send' }),
      el('div.kpi-value', { text: String(prepared.length) }),
      el('div.kpi-note', { text: prepared.length ? 'Review and send below' : 'Nothing waiting on you' }),
    ]),
    el('div.kpi.accent-info', {}, [
      el('div.kpi-label', { text: 'Queued for Claude' }),
      el('div.kpi-value', { text: String(pending.length) }),
      el('div.kpi-note', { text: 'Work it has not picked up yet' }),
    ]),
    el('div.kpi.accent-ok', {}, [
      el('div.kpi-label', { text: 'Sent today' }),
      el('div.kpi-value', { text: String(status.today.byType.dm || 0) }),
      el('div.kpi-note', { html: `Daily cap <strong>${status.limits.dmsPerDay}</strong> · hourly <strong>${status.limits.dmsPerHour}</strong>` }),
    ]),
    el(`div.kpi.${status.quietHours ? 'accent-warn' : ''}`, {}, [
      el('div.kpi-label', { text: 'Status' }),
      el('div.kpi-value.sm', { text: status.quietHours ? 'Quiet hours' : status.enabled ? 'Active' : 'Off' }),
      el('div.kpi-note', {
        text: status.quietHours
          ? 'Messaging paused for the night'
          : status.lastActivityAt ? `Last activity ${relTime(status.lastActivityAt)}` : 'No activity yet',
      }),
    ]),
  ]));

  // ---- pairing -----------------------------------------------------------
  const tokenBox = el('input', { value: token, readonly: true, style: { fontFamily: 'var(--mono)', fontSize: '12px' } });
  root.appendChild(card('Connect Claude in Chrome', {
    sub: 'One-time setup — paste the starter prompt into Claude with this tab open',
    actions: [
      el('button.btn.btn-sm', {
        text: 'Regenerate token',
        onclick: () => confirmDialog('Regenerate the token? Claude will need the new starter prompt.', async () => {
          await api.post('/api/automation/token/regenerate');
          toast('New token generated');
          ctx.refresh();
        }, { confirmLabel: 'Regenerate', danger: false }),
      }),
    ],
  }, el('div', {}, [
    el('label', { text: 'Agent token' }),
    tokenBox,
    el('div', { style: { display: 'flex', gap: '8px', marginTop: '10px', flexWrap: 'wrap' } }, [
      el('button.btn.btn-gold', { text: '📋 Copy starter prompt', onclick: () => copyText(starterPrompt(token, ctx), 'Starter prompt copied — paste it into Claude in Chrome') }),
      el('button.btn', { text: 'View prompt', onclick: () => showPrompt(starterPrompt(token, ctx)) }),
      el('button.btn', { text: '↻ Refresh queue from pipeline', onclick: async () => {
        const r = await api.post('/api/automation/rebuild');
        toast(`${r.created} message${r.created === 1 ? '' : 's'} queued for Claude`);
        ctx.refresh();
      } }),
      el('button.btn', { text: '+ Collect comments from a post', onclick: () => harvestForm(ctx) }),
    ]),
    el('p.small.muted', { style: { marginTop: '12px' }, html:
      'Keep this app running while Claude works. The token is what stops any other website from reading your leads — ' +
      'do not paste it anywhere public.' }),
  ])));

  // ---- awaiting send -----------------------------------------------------
  if (prepared.length) {
    root.appendChild(card('Ready for you to send', {
      sub: 'Claude has typed these into the conversation. Read each one, press send in Facebook, then confirm here.',
      tight: true,
    }, table(
      ['Lead', 'Message Claude prepared', 'Staged', ''],
      prepared.map((a) => el('tr', {}, [
        el('td', {}, [
          el('div.strong', { text: a.leadName || '—' }),
          a.lead ? el('div.small.muted', { text: `${a.lead.city || 'no city'} · score ${a.lead.score}` }) : null,
        ]),
        el('td', {}, [el('div.small', { text: a.message, style: { maxWidth: '460px', whiteSpace: 'pre-wrap' } })]),
        el('td.small.muted', { text: relTime(a.preparedAt || a.createdAt) }),
        el('td', { style: { textAlign: 'right', whiteSpace: 'nowrap' } }, [
          el('button.btn.btn-sm', { text: '📋', title: 'Copy message', onclick: () => copyText(a.message) }),
          a.leadId ? el('button.btn.btn-sm', { text: 'Open', style: { marginLeft: '6px' }, onclick: () => ctx.openLead(a.leadId) }) : null,
          el('button.btn.btn-sm.btn-gold', {
            text: '✓ I sent it', style: { marginLeft: '6px' },
            onclick: async () => {
              await api.post(`/api/automation/actions/${a.id}/sent`);
              toast('Logged as sent');
              ctx.refresh();
            },
          }),
          el('button.btn.btn-sm.btn-danger', {
            text: '×', title: 'Discard', style: { marginLeft: '6px' },
            onclick: async () => { await api.del(`/api/automation/actions/${a.id}`); toast('Discarded'); ctx.refresh(); },
          }),
        ]),
      ])),
    )));
  }

  // ---- queued ------------------------------------------------------------
  root.appendChild(card('Queued for Claude', {
    sub: pending.length ? `${pending.length} waiting` : 'Nothing queued',
    tight: Boolean(pending.length),
  }, pending.length
    ? table(['Type', 'What', 'Priority', ''], pending.slice(0, 25).map((a) => el('tr', {}, [
        el('td', {}, [el('span.chip.neutral', { text: a.type })]),
        el('td', {}, [
          el('div.strong', { text: a.title }),
          el('div.small.muted', { text: a.instruction.slice(0, 110) + (a.instruction.length > 110 ? '…' : '') }),
        ]),
        el('td', {}, [a.lead ? scoreBadge(a.lead) : el('span.muted.small', { text: String(a.priority) })]),
        el('td', { style: { textAlign: 'right' } }, [
          el('button.btn.btn-sm.btn-danger', {
            text: '×',
            onclick: async () => { await api.del(`/api/automation/actions/${a.id}`); ctx.refresh(); },
          }),
        ]),
      ])))
    : emptyState('🤖', 'Queue is empty',
        'Refresh the queue from your pipeline, or point Claude at a post to collect comments from.',
        el('button.btn.btn-primary', { text: '↻ Refresh queue from pipeline', onclick: async () => {
          const r = await api.post('/api/automation/rebuild');
          toast(`${r.created} queued for Claude`);
          ctx.refresh();
        } }))));

  // ---- limits ------------------------------------------------------------
  const limits = el('div.grid-3', {}, [
    field('Messages per day', input('dmsPerDay', { type: 'number', value: String(status.limits.dmsPerDay) })),
    field('Messages per hour', input('dmsPerHour', { type: 'number', value: String(status.limits.dmsPerHour) })),
    field('Seconds between actions', input('minSecondsBetweenActions', { type: 'number', value: String(status.limits.minSecondsBetweenActions) })),
  ]);
  root.appendChild(card('Safety limits', {
    sub: 'The queue refuses to hand out more than this, no matter what Claude is asked to do',
    actions: el('button.btn.btn-sm.btn-primary', {
      text: 'Save',
      onclick: async () => {
        const v = {};
        for (const n of limits.querySelectorAll('input')) v[n.name] = Number(n.value);
        await api.patch('/api/automation/limits', v);
        toast('Limits saved');
        ctx.refresh();
      },
    }),
  }, el('div', {}, [
    limits,
    el('p.small.muted', { html:
      'Volume is what gets accounts flagged. Twenty-five thoughtful messages a day to people who commented on your ' +
      'posts is normal activity; two hundred identical ones is not. Quiet hours are set under Settings → outreach.' }),
  ])));

  // ---- history -----------------------------------------------------------
  if (recent.length) {
    root.appendChild(card('Recent activity', {
      sub: 'What Claude has done',
      tight: true,
      actions: el('button.btn.btn-sm', {
        text: 'Clear history',
        onclick: async () => { await api.post('/api/automation/clear'); toast('Cleared'); ctx.refresh(); },
      }),
    }, table(['Type', 'What', 'Result', 'When'], recent.map((a) => el('tr', {}, [
      el('td', {}, [el(`span.chip.${a.status === 'done' ? 'ok' : 'neutral'}`, { text: a.status })]),
      el('td', {}, [el('div.small', { text: a.title })]),
      el('td.small.muted', { text: a.result || '—' }),
      el('td.small.muted', { text: relTime(a.completedAt || a.createdAt) }),
    ])))));
  }
}

function harvestForm(ctx) {
  const body = el('div', {}, [
    el('p.small.muted', { text: 'Paste the URL of one of your Facebook posts. Claude will open it, expand every comment, and add anyone who shows buying interest as a lead. It will not message anyone during this pass.' }),
    field('Post URL', input('postUrl', { placeholder: 'https://www.facebook.com/…/posts/…' })),
    field('Label (optional)', input('label', { placeholder: 'ITIN post Sept 8' })),
  ]);
  modal({
    title: 'Collect comments from a post',
    body,
    buttons: [
      { label: 'Cancel' },
      { label: 'Queue it', variant: 'primary', onClick: async (close) => {
        const postUrl = body.querySelector('[name="postUrl"]').value.trim();
        if (!postUrl) return toast('Post URL is required', 'err');
        await api.post('/api/automation/harvest', { postUrl, label: body.querySelector('[name="label"]').value.trim() });
        toast('Queued — tell Claude to check its queue');
        close();
        ctx.refresh();
      } },
    ],
  });
}

function showPrompt(text) {
  modal({
    title: 'Starter prompt for Claude in Chrome',
    width: '680px',
    body: el('div', {}, [
      el('p.small.muted', { text: 'Open Claude in Chrome, then paste this. It tells Claude how to reach this app and how to behave.' }),
      el('div.pre', { text }),
    ]),
    buttons: [{ label: 'Copy', onClick: (close) => { copyText(text); close(); } }, { label: 'Close' }],
  });
}

function starterPrompt(token, ctx) {
  const base = ctx.meta.baseUrl || 'http://127.0.0.1:4317';
  const agent = ctx.settings.agent;
  return `You are helping me run lead generation for ${agent.name}, a real estate agent in the Maricopa, Arizona area (${agent.phone}). He is my brother and I have his permission to work his Facebook account.

I have a local app running at ${base}. Use it as your source of truth for who to contact and what to say.

Authenticate every request to it with this header:
  X-Agent-Token: ${token}

Start by fetching ${base}/api/agent/manifest and follow the ground rules it returns.

The most important rule: YOU PREPARE, I SEND.
Type messages and posts into the box, then stop and tell me it is ready. Never press send, Post, or submit. Never contact anyone who did not come from the app's queue.

Today, work in this order:
1. GET ${base}/api/agent/queue — do what each action says, in order.
2. If I give you a post URL, open it, expand all comments, and POST everyone who
   shows buying interest to ${base}/api/agent/comments.
3. After each action, POST to ${base}/api/agent/actions/{id}/complete with
   outcome "prepared" (staged, waiting on me) or "skipped" (with a reason).
4. Stop when the queue says you are blocked, and tell me why.

If anything is unclear, ask me instead of guessing.`;
}
