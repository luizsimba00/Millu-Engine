const state = { token: sessionStorage.getItem('millu-api-token') || '', status: '', query: '', selectedId: null, orders: [] };
const $ = (selector) => document.querySelector(selector);
const tokenInput = $('#api-token');
const statusLabels = { processing: 'Processando', simulated: 'Simulado', created: 'Criado', failed: 'Falhou' };

tokenInput.value = state.token;
function toast(message) { const item = $('#toast'); item.textContent = message; item.classList.add('show'); setTimeout(() => item.classList.remove('show'), 3200); }
function api(path) { return fetch(path, { headers: { Authorization: `Bearer ${state.token}` } }); }
function localDate(value) { return value ? new Intl.DateTimeFormat('pt-BR',{dateStyle:'short',timeStyle:'short'}).format(new Date(value)) : '—'; }
function escapeHTML(value) { return String(value ?? '—').replace(/[&<>'"]/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[char])); }

async function loadHealth() {
  try { const data = await (await fetch('/api/health')).json(); $('#system-status').textContent = 'Nó online'; $('#mode-label').textContent = data.mode === 'simulation' ? 'MODO SIMULAÇÃO' : 'OLIST AO VIVO'; } catch { $('#system-status').textContent = 'Sem sinal'; $('#mode-label').textContent = 'OFFLINE'; }
}
async function loadDashboard() {
  if (!state.token) return;
  const [summaryRes, ordersRes] = await Promise.all([api('/api/audit/summary'), api(`/api/audit/orders?${new URLSearchParams({ ...(state.status && {status:state.status}), ...(state.query && {q:state.query}), limit:'50' })}`)]);
  if (summaryRes.status === 401 || ordersRes.status === 401) { toast('Chave de operação inválida ou ausente.'); return; }
  if (!summaryRes.ok || !ordersRes.ok) throw new Error('A auditoria não está disponível agora.');
  const summary = await summaryRes.json(); const result = await ordersRes.json();
  const cards = [...document.querySelectorAll('.metric-card strong')];
  [summary.total, summary.processing, summary.simulated, summary.failed].forEach((value, index) => cards[index].textContent = value);
  state.orders = result.orders; renderOrders();
}
function renderOrders() {
  const body = $('#orders-body');
  if (!state.orders.length) { body.innerHTML = '<tr class="empty"><td colspan="6">Nenhum pedido encontrado para este recorte.</td></tr>'; return; }
  body.innerHTML = state.orders.map(order => `<tr class="order-row ${String(order.id) === String(state.selectedId) ? 'selected':''}" data-id="${order.id}"><td><b>${escapeHTML(order.external_order_number)}</b><small>${escapeHTML(order.sku)}</small></td><td><span class="status ${order.status}">${statusLabels[order.status] || order.status}</span></td><td>${escapeHTML(order.target_company_name)}</td><td>${escapeHTML(order.olist_order_id)}</td><td>${localDate(order.processed_at || order.created_at)}</td><td><button class="open-detail" aria-label="Inspecionar pedido">→</button></td></tr>`).join('');
  body.querySelectorAll('.order-row').forEach(row => row.addEventListener('click', () => inspectOrder(row.dataset.id)));
}
async function inspectOrder(id) {
  if (!state.token) return;
  const response = await api(`/api/audit/orders/${id}`); if (!response.ok) return toast('Não foi possível carregar este pedido.');
  const { order } = await response.json(); state.selectedId = id; renderOrders();
  $('#detail-panel').innerHTML = `<p class="eyebrow">TRILHA DE EXECUÇÃO</p><h3>${escapeHTML(order.external_order_number)}</h3><div class="detail-list"><div><span>STATUS</span><b><span class="status ${order.status}">${statusLabels[order.status] || order.status}</span></b></div><div><span>SKU / QUANTIDADE</span><b>${escapeHTML(order.sku)} · ${order.quantity} un.</b></div><div><span>REGRA APLICADA</span><b>${escapeHTML(order.routing_rule)}</b></div><div><span>DESTINO</span><b>${escapeHTML(order.target_company_name)} · Depósito ${escapeHTML(order.warehouse_id)}</b></div><div><span>ID OLIST</span><b>${escapeHTML(order.olist_order_id)}</b></div>${order.error_code ? `<div><span>FALHA REPORTADA</span><b>${escapeHTML(order.error_code)}</b></div>` : ''}</div><div class="timeline">RECEBIDO · ${localDate(order.created_at)}<br>PROCESSADO · ${localDate(order.processed_at)}<br>REGISTRO #${escapeHTML(order.id)}</div>`;
}
function syncRoutes() { const map = $('.flow-map'); if (!map || map.offsetParent === null) return; const rect = map.getBoundingClientRect(); $('.network-routes').setAttribute('viewBox', `0 0 ${rect.width} ${rect.height}`); const point = (selector, side) => { const node = $(selector).getBoundingClientRect(); const x = side === 'left' ? node.left : side === 'right' ? node.right : node.left + node.width / 2; const y = side === 'top' ? node.top : side === 'bottom' ? node.bottom : node.top + node.height / 2; return [x - rect.left, y - rect.top]; }; const setRoute = (name, start, end) => document.querySelectorAll(`#route-${name}, .route-${name}`).forEach(path => path.setAttribute('d', `M${start[0]} ${start[1]} L${end[0]} ${end[1]}`)); setRoute('in', point('.origin', 'right'), point('.routing', 'left')); setRoute('a', point('.routing', 'right'), point('.company-a', 'left')); setRoute('b', point('.routing', 'right'), point('.company-b', 'left')); setRoute('olist', point('.routing', 'bottom'), point('.olist', 'top')); }
function showView(id, updateHash = true) { if (!document.getElementById(id)) return; document.querySelectorAll('.view').forEach(v => v.classList.toggle('active-view', v.id === id)); document.querySelectorAll('.nav-item').forEach(a => a.classList.toggle('active', a.dataset.nav === id)); $('#section-title').textContent = id === 'command' ? 'CENTRAL' : id === 'flow' ? 'FLUXO' : 'AUDITORIA'; document.querySelector('.sidebar').classList.remove('open'); if (id === 'flow') requestAnimationFrame(syncRoutes); if (updateHash && location.hash !== `#${id}`) history.pushState(null, '', `#${id}`); }
document.querySelectorAll('[href^="#"]').forEach(link => link.addEventListener('click', event => { const id = link.getAttribute('href').slice(1); if (document.getElementById(id)) { event.preventDefault(); showView(id); } }));
$('#connect').addEventListener('click', async () => { state.token = tokenInput.value.trim(); if (!state.token) return toast('Informe a chave de operação.'); sessionStorage.setItem('millu-api-token', state.token); try { await loadDashboard(); toast('Painel conectado com sucesso.'); } catch (error) { toast(error.message); } });
$('#token-toggle').addEventListener('click', () => tokenInput.type = tokenInput.type === 'password' ? 'text' : 'password');
$('#refresh').addEventListener('click', async () => { try { await loadDashboard(); toast('Auditoria atualizada.'); } catch (error) { toast(error.message); } });
$('#filters').addEventListener('click', async event => { const button = event.target.closest('.filter'); if (!button) return; state.status = button.dataset.status; document.querySelectorAll('.filter').forEach(filter => filter.classList.toggle('active', filter === button)); try { await loadDashboard(); } catch (error) { toast(error.message); } });
let debounce; $('#search').addEventListener('input', event => { clearTimeout(debounce); debounce = setTimeout(async () => { state.query = event.target.value.trim(); try { await loadDashboard(); } catch (error) { toast(error.message); } }, 350); });
document.querySelectorAll('.flow-node').forEach(node => node.addEventListener('click', () => { document.querySelectorAll('.flow-node').forEach(item => item.classList.toggle('selected', item === node)); state.status = node.dataset.filter; document.querySelectorAll('.filter').forEach(filter => filter.classList.toggle('active', filter.dataset.status === state.status)); showView('audit'); loadDashboard().catch(error => toast(error.message)); }));
$('#menu-toggle').addEventListener('click', () => document.querySelector('.sidebar').classList.toggle('open'));

function network() { const canvas = $('#network-canvas'), ctx = canvas.getContext('2d'); let points = []; function resize(){canvas.width=innerWidth;canvas.height=innerHeight;points=Array.from({length:Math.min(70,Math.round(innerWidth/21))},()=>({x:Math.random()*canvas.width,y:Math.random()*canvas.height,vx:(Math.random()-.5)*.18,vy:(Math.random()-.5)*.18})); syncRoutes();} function draw(){ctx.clearRect(0,0,canvas.width,canvas.height);points.forEach(p=>{p.x+=p.vx;p.y+=p.vy;if(p.x<0||p.x>canvas.width)p.vx*=-1;if(p.y<0||p.y>canvas.height)p.vy*=-1;ctx.fillStyle='#42e7e1';ctx.fillRect(p.x,p.y,1,1);points.forEach(q=>{const d=Math.hypot(p.x-q.x,p.y-q.y);if(d<100){ctx.strokeStyle=`rgba(66,231,225,${.1*(1-d/100)})`;ctx.beginPath();ctx.moveTo(p.x,p.y);ctx.lineTo(q.x,q.y);ctx.stroke();}})});requestAnimationFrame(draw);} resize();addEventListener('resize',resize);draw(); } network(); const initialView = location.hash.slice(1); if (['command','flow','audit'].includes(initialView)) showView(initialView, false); addEventListener('popstate', () => showView(location.hash.slice(1) || 'command', false)); loadHealth(); if (state.token) loadDashboard().catch(()=>{});
