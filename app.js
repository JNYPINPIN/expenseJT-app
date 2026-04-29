// ===== Data Store =====
var STORAGE_KEY = 'family-expense-app';
var ACCOUNTS_KEY = 'expense-app-accounts';
var CURRENT_USER_KEY = 'expense-app-current-user';

function getAccounts() {
    try { var r = localStorage.getItem(ACCOUNTS_KEY); if(r) return JSON.parse(r); } catch(e){}
    return [];
}
function saveAccounts(list) { localStorage.setItem(ACCOUNTS_KEY, JSON.stringify(list)); }
function getCurrentUser() { return localStorage.getItem(CURRENT_USER_KEY) || ''; }
function setCurrentUser(name) { localStorage.setItem(CURRENT_USER_KEY, name); }

function getUserStorageKey(username) {
    return STORAGE_KEY + '-' + username.replace(/[^a-zA-Z0-9ก-๙]/g, '_');
}

function getDefaultData() {
    return {
        expenses: [],
        familyMembers: ['ฉัน', 'คู่ครอง'],
        creditCards: [{ id: 'cc1', name: 'Shopee', last4: '0000' }],
        shops: ['Shopee', 'Line Man', '7-11', 'ร้านค้าทั่วไป'],
        settings: { defaultSplit: 2 }
    };
}

function loadData() {
    var user = getCurrentUser();
    var key = user ? getUserStorageKey(user) : STORAGE_KEY;
    try {
        var raw = localStorage.getItem(key);
        if (raw) return JSON.parse(raw);
    } catch (e) { console.error('Load error', e); }
    return getDefaultData();
}

function saveData(data) {
    var user = getCurrentUser();
    var key = user ? getUserStorageKey(user) : STORAGE_KEY;
    localStorage.setItem(key, JSON.stringify(data));
}

var appData = loadData();
var currentDate = new Date();
var currentTab = 'expenses';
var editingExpenseId = null;

// ===== Utility =====
var THAI_MONTHS = ['มกราคม','กุมภาพันธ์','มีนาคม','เมษายน','พฤษภาคม','มิถุนายน','กรกฎาคม','สิงหาคม','กันยายน','ตุลาคม','พฤศจิกายน','ธันวาคม'];
var SHORT_MONTHS = ['ม.ค.','ก.พ.','มี.ค.','เม.ย.','พ.ค.','มิ.ย.','ก.ค.','ส.ค.','ก.ย.','ต.ค.','พ.ย.','ธ.ค.'];

function formatMoney(n) {
    if (n === undefined || n === null || isNaN(n)) return '฿0';
    return '฿' + Number(n).toLocaleString('th-TH', {minimumFractionDigits:0, maximumFractionDigits:2});
}
function getMonthKey(d) { return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0'); }
function monthKeyToDate(k) { var p=k.split('-').map(Number); return new Date(p[0],p[1]-1,1); }
function addMonths(d,n) { var r=new Date(d); r.setMonth(r.getMonth()+n); return r; }
function generateId() { return Date.now().toString(36)+Math.random().toString(36).substr(2,5); }
function getChannelIcon(c) {
    return c==='cash'?'💵':c==='credit'?'💳':c==='shopee'?'🛒':'📋';
}
function getChannelLabel(c) { return c==='cash'?'เงินสด':c==='credit'?'บัตรเครดิต':c==='shopee'?'Shopee':c; }
function formatDateInput(d) { return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0'); }

// ===== Get expenses for month (including installments) =====
function getExpensesForMonth(monthKey) {
    var results = [];
    appData.expenses.forEach(function(exp) {
        var inst = exp.installments || 1;
        if (inst === 1) {
            if (exp.monthKey === monthKey) results.push({...exp, monthlyAmount:exp.amount, isInstallment:false});
        } else {
            var expDate = monthKeyToDate(exp.monthKey);
            var perMonth = Math.ceil(exp.amount / inst);
            for (var i=0; i<inst; i++) {
                if (getMonthKey(addMonths(expDate,i)) === monthKey) {
                    var remaining = exp.amount - (perMonth*i);
                    results.push({...exp, monthlyAmount:Math.min(perMonth,remaining), isInstallment:true, installmentNum:i+1, installmentTotal:inst});
                    break;
                }
            }
        }
    });
    return results;
}

// ===== Navigation =====
function changeMonth(delta) { currentDate = addMonths(currentDate, delta); render(); }

function updateMonthDisplay() {
    var container = document.getElementById('month-scroll');
    if (!container) return;
    var currentKey = getMonthKey(currentDate);
    // Calculate how many months fit based on screen width
    var screenW = window.innerWidth;
    var count;
    if (screenW < 360) count = 5;
    else if (screenW < 480) count = 5;
    else if (screenW < 700) count = 7;
    else count = 9;
    var half = Math.floor(count / 2);
    var months = [];
    for (var i = -half; i <= half; i++) {
        var d = addMonths(currentDate, i);
        var key = getMonthKey(d);
        var thaiYear = (d.getFullYear() + 543).toString().slice(-2);
        months.push({ key: key, label: SHORT_MONTHS[d.getMonth()] + thaiYear, active: key === currentKey });
    }
    container.innerHTML = months.map(function(m) {
        return '<div class="month-tab' + (m.active ? ' active' : '') + '" onclick="goToMonth(\'' + m.key + '\')">' + m.label + '</div>';
    }).join('');
}

function goToMonth(monthKey) {
    var d = monthKeyToDate(monthKey);
    currentDate = d;
    render();
}
function switchTab(tab) {
    currentTab = tab;
    document.querySelectorAll('.nav-btn').forEach(function(b){ b.classList.toggle('active', b.dataset.tab===tab); });
    render();
}

// ===== Render Summary =====
function renderSummary(expenses) {
    var total=0, myShare=0, channelTotals={}, cardTotals={}, memberTotals={};
    expenses.forEach(function(exp) {
        var amt=exp.monthlyAmount; total+=amt;
        var sc=exp.splitCount||1, pp=Math.ceil(amt/sc);
        myShare+=pp;
        var ch=exp.channel||'cash'; channelTotals[ch]=(channelTotals[ch]||0)+amt;
        if(ch==='credit'&&exp.creditCardId){var card=appData.creditCards.find(function(c){return c.id===exp.creditCardId});var cn=card?card.name+' *'+card.last4:'ไม่ระบุ';cardTotals[cn]=(cardTotals[cn]||0)+amt;}
        // Per-member breakdown (exclude first member = "me")
        var members = exp.splitMembers || [];
        members.forEach(function(name){
            if(name !== appData.familyMembers[0]) {
                memberTotals[name] = (memberTotals[name]||0) + pp;
            }
        });
    });
    document.getElementById('total-expense').textContent=formatMoney(total);
    document.getElementById('my-share').textContent=formatMoney(myShare);

    // Build collect label with member names and amounts
    var collectTotal = total - myShare;
    document.getElementById('collect-amount').textContent=formatMoney(collectTotal);
    var memberEntries = Object.entries(memberTotals);
    var collectLabel = document.getElementById('collect-label');
    if(memberEntries.length > 0) {
        var names = memberEntries.map(function(e){ return 'ของ'+e[0]; });
        collectLabel.textContent = 'รายจ่าย' + names.join(', ');
    } else {
        collectLabel.textContent = 'เรียกเก็บ';
    }

    document.getElementById('channel-summary').innerHTML=Object.entries(channelTotals).map(function(e){return '<div class="channel-chip"><span class="dot '+e[0]+'"></span>'+getChannelLabel(e[0])+' '+formatMoney(e[1])+'</div>';}).join('');
    var ccEl=document.getElementById('credit-card-summary');
    var ccE=Object.entries(cardTotals);
    ccEl.innerHTML=ccE.length?ccE.map(function(e){return '<div class="cc-card"><span class="cc-name"><i class="fas fa-credit-card"></i> '+e[0]+'</span><span class="cc-amount">'+formatMoney(e[1])+'</span></div>';}).join(''):'';
}

// ===== Render Expense List =====
function renderExpenseList(expenses) {
    var el = document.getElementById('expense-list');
    if (currentTab==='installments') { renderInstallmentsTab(el); return; }
    if (currentTab==='summary') { renderSummaryTab(el, expenses); return; }
    if (currentTab==='share') { renderShareTab(el, expenses); return; }
    if (currentTab==='settings') { renderSettingsTab(el); return; }

    if (!expenses.length) {
        el.innerHTML='<div class="empty-state"><div style="font-size:48px;margin-bottom:12px">📋</div><p>'+i18n.noExpenses+'</p><p style="font-size:14px;margin-top:8px">'+i18n.tapAdd+'</p></div>';
        return;
    }
    // Sort by date descending (newest first)
    var sorted = expenses.slice().sort(function(a,b){
        var da = a.date || a.monthKey + '-01';
        var db = b.date || b.monthKey + '-01';
        return db.localeCompare(da);
    });
    // Group by date
    var groups={};
    sorted.forEach(function(exp){
        var d = exp.date || exp.monthKey + '-01';
        if(!groups[d]) groups[d]=[];
        groups[d].push(exp);
    });
    var html='';
    Object.entries(groups).forEach(function(g){
        // Format date header
        var parts = g[0].split('-');
        var day = parseInt(parts[2])||1;
        var monthIdx = parseInt(parts[1])-1;
        var year = parseInt(parts[0])+543;
        var dateLabel = day + ' ' + SHORT_MONTHS[monthIdx] + ' ' + String(year).slice(-2);
        html+='<div class="expense-group-header">'+dateLabel+'</div>';
        g[1].forEach(function(exp){
            var ch=exp.channel||'cash', sc=exp.splitCount||1, pp=Math.ceil(exp.monthlyAmount/sc);
            var meta='';
            var isPaid = exp.paid === true;
            if(exp.isInstallment) meta+='<span class="tag installment">งวด '+exp.installmentNum+'/'+exp.installmentTotal+'</span>';
            if(sc>1) meta+='<span class="tag">หาร '+(exp.splitMembers?exp.splitMembers.join(', '):sc+' คน')+'</span>';
            if(exp.shop) meta+='<span>'+exp.shop+'</span>';
            meta+='<span>'+getChannelLabel(ch)+'</span>';
            if(isPaid) meta+='<span class="tag paid">จ่ายแล้ว ✓</span>';
            html+='<div class="expense-item-wrap'+(isPaid?' is-paid':'')+'">'
                +'<div class="expense-item" onclick="toggleExpActions(this.parentNode)">'
                +'<div class="expense-icon '+ch+'">'+getChannelIcon(ch)+'</div>'
                +'<div class="expense-details"><div class="expense-name">'+(exp.name||'ไม่ระบุ')+'</div><div class="expense-meta">'+meta+'</div></div>'
                +'<div class="expense-amounts"><div class="expense-total">'+formatMoney(exp.monthlyAmount)+'</div>'
                +(sc>1?'<div class="expense-share">'+i18n.perPerson+' '+formatMoney(pp)+'</div>':'')
                +'</div>'
                +'<div class="expense-chevron">▼</div>'
                +'</div>'
                +'<div class="expense-actions">'
                +'<button class="act-btn act-edit" onclick="editExpense(\''+exp.id+'\')">✏️ '+i18n.edit+'</button>'
                +'<button class="act-btn act-paid" onclick="togglePaid(\''+exp.id+'\')">'
                +(isPaid?'↩️ '+i18n.unpaid:'✅ '+i18n.paid)
                +'</button>'
                +'<button class="act-btn act-share" onclick="shareOneExpense(\''+exp.id+'\')">📤 '+i18n.share+'</button>'
                +'<button class="act-btn act-delete" onclick="quickDelete(\''+exp.id+'\')">🗑️ '+i18n.delBtn+'</button>'
                +'</div>'
                +'</div>';
        });
    });
    el.innerHTML=html;
}

// ===== Installments Tab =====
function renderInstallmentsTab(container) {
    var list = appData.expenses.filter(function(e){return (e.installments||1)>1;});
    if(!list.length){container.innerHTML='<div class="empty-state"><i class="fas fa-calendar-alt"></i><p>ยังไม่มีรายการผ่อนชำระ</p></div>';return;}
    var ck=getMonthKey(currentDate), html='';
    list.forEach(function(exp){
        var ed=monthKeyToDate(exp.monthKey), pm=Math.ceil(exp.amount/exp.installments), paid=0;
        for(var i=0;i<exp.installments;i++){if(getMonthKey(addMonths(ed,i))<=ck)paid=i+1;}
        var endD=addMonths(ed,exp.installments-1), prog=Math.min(100,(paid/exp.installments)*100), rem=exp.installments-paid;
        var sc=exp.splitCount||1, pp=Math.ceil(pm/sc);
        html+='<div class="installment-card"><div class="installment-header"><span class="installment-name">'+(exp.name||'ไม่ระบุ')+'</span>'
            +'<span class="installment-badge">'+(rem>0?'เหลือ '+rem+' งวด':'ครบแล้ว')+'</span></div>'
            +'<div style="font-size:13px;color:var(--text-light)">'+formatMoney(exp.amount)+' → งวดละ '+formatMoney(pm)+(sc>1?' (คนละ '+formatMoney(pp)+')':'')+'</div>'
            +'<div class="installment-progress"><div class="installment-progress-bar" style="width:'+prog+'%"></div></div>'
            +'<div class="installment-info"><span>จ่ายแล้ว '+paid+'/'+exp.installments+' งวด</span>'
            +'<span>'+SHORT_MONTHS[ed.getMonth()]+' '+(ed.getFullYear()+543)+' - '+SHORT_MONTHS[endD.getMonth()]+' '+(endD.getFullYear()+543)+'</span></div></div>';
    });
    container.innerHTML=html;
}

// ===== Summary Tab =====
function renderSummaryTab(container, expenses) {
    if(!expenses.length){container.innerHTML='<div class="empty-state"><i class="fas fa-chart-pie"></i><p>ยังไม่มีข้อมูลสรุป</p></div>';return;}
    var total=0,myT=0,famT=0,byCh={},byShop={},byCard={};
    expenses.forEach(function(exp){
        var a=exp.monthlyAmount;total+=a;var s=exp.splitCount||1,pp=Math.ceil(a/s);myT+=pp;famT+=a-pp;
        var ch=getChannelLabel(exp.channel||'cash');byCh[ch]=(byCh[ch]||0)+a;
        var sh=exp.shop||'อื่นๆ';byShop[sh]=(byShop[sh]||0)+a;
        if(exp.channel==='credit'&&exp.creditCardId){var c=appData.creditCards.find(function(x){return x.id===exp.creditCardId});var cn=c?c.name+' *'+c.last4:'ไม่ระบุ';byCard[cn]=(byCard[cn]||0)+a;}
    });
    var h='<div class="summary-section"><h3><i class="fas fa-wallet"></i> สรุปยอดรวม</h3>'
        +'<div class="summary-row"><span>รวมทั้งหมด</span><span>'+formatMoney(total)+'</span></div>'
        +'<div class="summary-row"><span>ส่วนของฉัน</span><span>'+formatMoney(myT)+'</span></div>'
        +'<div class="summary-row"><span>เก็บจากครอบครัว</span><span style="color:var(--danger)">'+formatMoney(famT)+'</span></div></div>';
    h+='<div class="summary-section"><h3><i class="fas fa-money-check-alt"></i> แยกตามช่องทาง</h3>';
    Object.entries(byCh).sort(function(a,b){return b[1]-a[1];}).forEach(function(e){h+='<div class="summary-row"><span>'+e[0]+'</span><span>'+formatMoney(e[1])+'</span></div>';});
    h+='<div class="summary-row total-row"><span>รวม</span><span>'+formatMoney(total)+'</span></div></div>';
    if(Object.keys(byCard).length){var cardTotal=0;h+='<div class="summary-section"><h3><i class="fas fa-credit-card"></i> แยกตามบัตรเครดิต</h3>';Object.entries(byCard).sort(function(a,b){return b[1]-a[1];}).forEach(function(e){cardTotal+=e[1];h+='<div class="summary-row"><span>'+e[0]+'</span><span>'+formatMoney(e[1])+'</span></div>';});h+='<div class="summary-row total-row"><span>รวมบัตรเครดิต</span><span>'+formatMoney(cardTotal)+'</span></div></div>';}
    h+='<div class="summary-section"><h3><i class="fas fa-store"></i> แยกตามร้านค้า</h3>';
    Object.entries(byShop).sort(function(a,b){return b[1]-a[1];}).forEach(function(e){h+='<div class="summary-row"><span>'+e[0]+'</span><span>'+formatMoney(e[1])+'</span></div>';});
    h+='<div class="summary-row total-row"><span>รวม</span><span>'+formatMoney(total)+'</span></div></div>';
    container.innerHTML=h;
}

// ===== Share Tab =====
function renderShareTab(container, expenses) {
    var shared=expenses.filter(function(e){return e.shared&&(e.splitCount||1)>1;});
    if(!shared.length){container.innerHTML='<div class="empty-state"><i class="fas fa-share-alt"></i><p>ยังไม่มีรายการแชร์</p></div>';return;}
    var memberTotals={}, totalCollect=0, items='';
    shared.forEach(function(exp){
        var a=exp.monthlyAmount,s=exp.splitCount||1,pp=Math.ceil(a/s),fs=a-pp;totalCollect+=fs;
        (exp.splitMembers||[]).forEach(function(n){if(n!==appData.familyMembers[0])memberTotals[n]=(memberTotals[n]||0)+pp;});
        items+='<div class="summary-row"><span>'+(exp.name||'ไม่ระบุ')+(exp.isInstallment?' (งวด '+exp.installmentNum+'/'+exp.installmentTotal+')':'')+'</span><span>'+formatMoney(pp)+' x '+s+'</span></div>';
    });
    var ml=THAI_MONTHS[currentDate.getMonth()]+' '+(currentDate.getFullYear()+543);
    var h='<div class="share-section"><div class="share-card"><h3><i class="fas fa-hand-holding-usd"></i> ยอดเก็บจากครอบครัว</h3>'
        +'<div style="text-align:center;padding:16px 0"><div style="font-size:32px;font-weight:700;color:var(--danger)">'+formatMoney(totalCollect)+'</div>'
        +'<div style="font-size:14px;color:var(--text-light);margin-top:4px">ประจำเดือน '+ml+'</div></div>';
    var me=Object.entries(memberTotals);
    if(me.length){h+='<div style="margin-top:8px">';me.forEach(function(e){h+='<div class="split-detail-row"><span class="member-name"><span class="avatar">'+e[0].charAt(0)+'</span>'+e[0]+'</span><span class="member-amount">'+formatMoney(e[1])+'</span></div>';});h+='</div>';}
    h+='<div class="share-actions" style="margin-top:12px"><button class="btn-copy" onclick="copyShareText()"><i class="fas fa-copy"></i> คัดลอก</button><button class="btn-line" onclick="shareToLine()"><i class="fab fa-line"></i> แชร์ Line</button></div></div>';
    h+='<div class="share-card"><h3><i class="fas fa-list"></i> รายการที่แชร์</h3>'+items+'</div></div>';
    container.innerHTML=h;
}

function getShareText() {
    var mk=getMonthKey(currentDate), exps=getExpensesForMonth(mk);
    var shared=exps.filter(function(e){return e.shared&&(e.splitCount||1)>1;});
    var ml=THAI_MONTHS[currentDate.getMonth()]+' '+(currentDate.getFullYear()+543);
    var t='💰 สรุปรายจ่ายครอบครัว\n📅 '+ml+'\n─────────────\n';
    var memberTotals={}, tc=0;
    shared.forEach(function(exp){
        var a=exp.monthlyAmount,s=exp.splitCount||1,pp=Math.ceil(a/s);tc+=a-pp;
        (exp.splitMembers||[]).forEach(function(n){if(n!==appData.familyMembers[0])memberTotals[n]=(memberTotals[n]||0)+pp;});
        t+='• '+(exp.name||'ไม่ระบุ')+': '+formatMoney(a)+' (คนละ '+formatMoney(pp)+')';
        if(exp.splitMembers&&exp.splitMembers.length)t+=' ['+exp.splitMembers.join(', ')+']';
        if(exp.isInstallment)t+=' [งวด '+exp.installmentNum+'/'+exp.installmentTotal+']';
        t+='\n';
    });
    t+='─────────────\n';
    var me=Object.entries(memberTotals);
    if(me.length){t+='👥 ยอดแต่ละคน:\n';me.forEach(function(e){t+='  • '+e[0]+': '+formatMoney(e[1])+'\n';});t+='─────────────\n';}
    t+='💵 ยอดเก็บรวม: '+formatMoney(tc)+'\n';
    return t;
}
function copyShareText() {
    var t=getShareText();
    if(navigator.clipboard){navigator.clipboard.writeText(t).then(function(){alert('คัดลอกแล้ว!');});} else {var ta=document.createElement('textarea');ta.value=t;document.body.appendChild(ta);ta.select();document.execCommand('copy');document.body.removeChild(ta);alert('คัดลอกแล้ว!');}
}
function shareToLine() { window.open('https://line.me/R/share?text='+encodeURIComponent(getShareText()),'_blank'); }

// ===== Member Picker =====
function renderMemberPicker(selectedMembers) {
    var container = document.getElementById('member-picker');
    if (!container) return;
    var selected = selectedMembers || appData.familyMembers.slice();
    container.innerHTML = appData.familyMembers.map(function(name) {
        var isSel = selected.indexOf(name) !== -1;
        return '<div class="member-chip '+(isSel?'selected':'')+'" data-member="'+name+'" onclick="toggleMember(this)">'
            +'<span class="chip-icon">'+(isSel?'✓':'👤')+'</span>'
            +'<span>'+name+'</span></div>';
    }).join('');
}
function toggleMember(el) {
    el.classList.toggle('selected');
    var icon = el.querySelector('.chip-icon');
    icon.textContent = el.classList.contains('selected') ? '✓' : '👤';
    updateSplitPreview();
}
function getSelectedMembers() {
    var chips = document.querySelectorAll('#member-picker .member-chip.selected');
    return Array.from(chips).map(function(c){ return c.dataset.member; });
}

// ===== Add/Edit Expense =====
function showAddExpense() {
    editingExpenseId = null;
    document.getElementById('modal-title').textContent = 'เพิ่มรายจ่าย';
    document.getElementById('expense-form').reset();
    document.getElementById('exp-installments').value = 1;
    document.getElementById('exp-date').value = formatDateInput(currentDate);
    document.getElementById('exp-shared').checked = true;
    document.getElementById('delete-btn').style.display = 'none';
    document.getElementById('save-btn').textContent = 'บันทึก';
    document.getElementById('installment-preview').style.display = 'none';
    document.getElementById('credit-card-group').style.display = 'none';
    renderMemberPicker(appData.familyMembers.slice());
    updateCreditCardSelect();
    updateSuggestions();
    updateSplitPreview();
    openModal('expense-modal');
}

function editExpense(id) {
    var exp = appData.expenses.find(function(e){return e.id===id;});
    if (!exp) return;
    editingExpenseId = id;
    document.getElementById('modal-title').textContent = 'แก้ไขรายจ่าย';
    document.getElementById('exp-id').value = id;
    document.getElementById('exp-name').value = exp.name || '';
    document.getElementById('exp-amount').value = exp.amount;
    document.getElementById('exp-channel').value = exp.channel || 'cash';
    // Set shop dropdown
    var shopVal = exp.shop || '';
    if (shopVal && appData.shops.indexOf(shopVal) === -1) {
        // Shop not in list, show as "other"
        updateShopDropdown('__other__');
        document.getElementById('exp-shop').value = '__other__';
        document.getElementById('exp-shop-custom').value = shopVal;
        document.getElementById('custom-shop-group').style.display = 'block';
    } else {
        updateShopDropdown(shopVal);
        document.getElementById('exp-shop').value = shopVal;
    }
    document.getElementById('exp-date').value = exp.date || '';
    document.getElementById('exp-installments').value = exp.installments || 1;
    document.getElementById('exp-shared').checked = exp.shared !== false;
    document.getElementById('delete-btn').style.display = 'block';
    document.getElementById('save-btn').textContent = 'อัปเดต';
    var selMem = exp.splitMembers || appData.familyMembers.slice(0, exp.splitCount || 1);
    renderMemberPicker(selMem);
    updateCreditCardSelect();
    if (exp.channel === 'credit') {
        document.getElementById('credit-card-group').style.display = 'block';
        document.getElementById('exp-credit-card').value = exp.creditCardId || '';
    } else {
        document.getElementById('credit-card-group').style.display = 'none';
    }
    updateSuggestions();
    updateInstallmentPreview();
    updateSplitPreview();
    openModal('expense-modal');
}

// ===== Save/Delete Expense =====
function saveExpense(event) {
    event.preventDefault();
    var name = document.getElementById('exp-name').value.trim();
    var amount = parseFloat(document.getElementById('exp-amount').value) || 0;
    var channel = document.getElementById('exp-channel').value;
    var creditCardId = channel==='credit' ? document.getElementById('exp-credit-card').value : null;
    var shop = getShopValue();
    var date = document.getElementById('exp-date').value;
    var installments = parseInt(document.getElementById('exp-installments').value) || 1;
    var splitMembers = getSelectedMembers();
    var splitCount = splitMembers.length || 1;
    var shared = document.getElementById('exp-shared').checked;
    if (splitMembers.length === 0) { alert('กรุณาเลือกอย่างน้อย 1 คน'); return; }
    var dateObj = date ? new Date(date) : currentDate;
    var monthKey = getMonthKey(dateObj);
    if (editingExpenseId) {
        var idx = appData.expenses.findIndex(function(e){return e.id===editingExpenseId;});
        if (idx !== -1) appData.expenses[idx] = Object.assign({}, appData.expenses[idx], {name:name,amount:amount,channel:channel,creditCardId:creditCardId,shop:shop,date:date,monthKey:monthKey,installments:installments,splitCount:splitCount,splitMembers:splitMembers,shared:shared});
    } else {
        appData.expenses.push({id:generateId(),name:name,amount:amount,channel:channel,creditCardId:creditCardId,shop:shop,date:date,monthKey:monthKey,installments:installments,splitCount:splitCount,splitMembers:splitMembers,shared:shared,createdAt:new Date().toISOString()});
    }
    if (shop && appData.shops.indexOf(shop)===-1) appData.shops.push(shop);
    saveData(appData);
    closeModal('expense-modal');
    render();
}
function deleteExpense() {
    if (!editingExpenseId) return;
    if (!confirm('ต้องการลบรายการนี้?')) return;
    appData.expenses = appData.expenses.filter(function(e){return e.id!==editingExpenseId;});
    saveData(appData); closeModal('expense-modal'); render();
}

// ===== Expense Item Actions =====
function toggleExpActions(wrap) {
    var wasOpen = wrap.classList.contains('open');
    // Close all others first
    document.querySelectorAll('.expense-item-wrap.open').forEach(function(el){ el.classList.remove('open'); });
    if (!wasOpen) wrap.classList.add('open');
}

function togglePaid(id) {
    var exp = appData.expenses.find(function(e){return e.id===id;});
    if (exp) {
        exp.paid = !exp.paid;
        saveData(appData);
        render();
    }
}

function quickDelete(id) {
    if (!confirm('ต้องการลบรายการนี้?')) return;
    appData.expenses = appData.expenses.filter(function(e){return e.id!==id;});
    saveData(appData);
    render();
}

function shareOneExpense(id) {
    var mk = getMonthKey(currentDate);
    var exps = getExpensesForMonth(mk);
    var exp = exps.find(function(e){return e.id===id;});
    if (!exp) return;
    var sc = exp.splitCount||1, pp = Math.ceil(exp.monthlyAmount/sc);
    var members = exp.splitMembers ? exp.splitMembers.join(', ') : sc+' คน';
    var text = '💰 รายจ่าย: '+(exp.name||'ไม่ระบุ')+'\n'
        +'💵 ยอด: '+formatMoney(exp.monthlyAmount)+'\n'
        +'👥 หาร: '+members+'\n'
        +'💳 คนละ: '+formatMoney(pp)+'\n'
        +'🏪 ร้าน: '+(exp.shop||'-')+'\n'
        +'📅 '+getChannelLabel(exp.channel||'cash');
    if (exp.isInstallment) text += '\n📆 งวด '+exp.installmentNum+'/'+exp.installmentTotal;
    if (navigator.share) {
        navigator.share({title:'รายจ่าย',text:text}).catch(function(){});
    } else if (navigator.clipboard) {
        navigator.clipboard.writeText(text).then(function(){alert('คัดลอกแล้ว!');});
    } else {
        var ta=document.createElement('textarea');ta.value=text;document.body.appendChild(ta);ta.select();document.execCommand('copy');document.body.removeChild(ta);alert('คัดลอกแล้ว!');
    }
}

// ===== Form Helpers =====
function updateCreditCardSelect() {
    document.getElementById('exp-credit-card').innerHTML = appData.creditCards.map(function(c){return '<option value="'+c.id+'">'+c.name+' *'+c.last4+'</option>';}).join('');
}
function updateSuggestions() {
    var names=[]; appData.expenses.forEach(function(e){if(e.name&&names.indexOf(e.name)===-1)names.push(e.name);});
    document.getElementById('item-suggestions').innerHTML=names.map(function(n){return '<option value="'+n+'">';}).join('');
    updateShopDropdown();
}
function updateShopDropdown(selectedValue) {
    var sel = document.getElementById('exp-shop');
    if (!sel) return;
    var html = '<option value="">-- เลือกร้านค้า --</option>';
    appData.shops.forEach(function(s) {
        html += '<option value="' + s + '"' + (selectedValue === s ? ' selected' : '') + '>' + s + '</option>';
    });
    html += '<option value="__other__">อื่นๆ (พิมพ์เอง)</option>';
    sel.innerHTML = html;
    // Show/hide custom input
    var customGroup = document.getElementById('custom-shop-group');
    if (customGroup) {
        if (selectedValue === '__other__') {
            customGroup.style.display = 'block';
        } else {
            customGroup.style.display = 'none';
        }
    }
}
function getShopValue() {
    var sel = document.getElementById('exp-shop');
    var val = sel ? sel.value : '';
    if (val === '__other__') {
        var custom = document.getElementById('exp-shop-custom');
        return custom ? custom.value.trim() : '';
    }
    return val;
}
function updateInstallmentPreview() {
    var amount=parseFloat(document.getElementById('exp-amount').value)||0;
    var inst=parseInt(document.getElementById('exp-installments').value)||1;
    var preview=document.getElementById('installment-preview');
    if(inst>1&&amount>0){
        var pm=Math.ceil(amount/inst), dv=document.getElementById('exp-date').value;
        var sd=dv?new Date(dv):currentDate, ed=addMonths(sd,inst-1);
        document.getElementById('installment-per-month').textContent=formatMoney(pm);
        document.getElementById('installment-range').textContent=SHORT_MONTHS[sd.getMonth()]+' '+(sd.getFullYear()+543)+' - '+SHORT_MONTHS[ed.getMonth()]+' '+(ed.getFullYear()+543);
        preview.style.display='block';
    } else { preview.style.display='none'; }
}
function updateSplitPreview() {
    var amount=parseFloat(document.getElementById('exp-amount').value)||0;
    var inst=parseInt(document.getElementById('exp-installments').value)||1;
    var selMem=getSelectedMembers(), sc=selMem.length||1;
    var monthly=inst>1?Math.ceil(amount/inst):amount, pp=sc>0?Math.ceil(monthly/sc):monthly;
    var prevEl=document.getElementById('split-preview');
    if(inst>1){prevEl.innerHTML='<p>ยอดต่อเดือน: <strong>'+formatMoney(monthly)+'</strong></p><p>หาร '+sc+' คน → คนละ: <strong>'+formatMoney(pp)+'</strong></p>';}
    else{prevEl.innerHTML='<p>หาร '+sc+' คน → คนละ: <strong>'+formatMoney(pp)+'</strong></p>';}
    var detEl=document.getElementById('split-detail');
    if(selMem.length&&amount>0){detEl.innerHTML=selMem.map(function(n){return '<div class="split-detail-row"><span class="member-name"><span class="avatar">'+n.charAt(0)+'</span>'+n+'</span><span class="member-amount">'+formatMoney(pp)+'</span></div>';}).join('');}
    else{detEl.innerHTML='';}
}

// ===== Theme System =====
var THEMES = [
    // --- พื้นฐาน ---
    {id:'default',name:'พื้นฐาน',emoji:'🌸',cat:'พื้นฐาน'},
    {id:'night',name:'กลางคืน',emoji:'🌙',cat:'พื้นฐาน'},
    // --- กระดาษ & Texture ---
    {id:'paper-white',name:'กระดาษขาว',emoji:'📄',cat:'กระดาษ'},
    {id:'paper-kraft',name:'กระดาษคราฟท์',emoji:'📦',cat:'กระดาษ'},
    {id:'paper-grid',name:'กระดาษตาราง',emoji:'📐',cat:'กระดาษ'},
    {id:'paper-dot',name:'กระดาษจุด',emoji:'⚬',cat:'กระดาษ'},
    {id:'paper-line',name:'กระดาษเส้น',emoji:'📝',cat:'กระดาษ'},
    {id:'paper-old',name:'กระดาษเก่า',emoji:'📜',cat:'กระดาษ'},
    // --- ภาพวาด ---
    {id:'watercolor',name:'สีน้ำ',emoji:'🎨',cat:'ภาพวาด'},
    {id:'crayon',name:'สีเทียน',emoji:'🖍️',cat:'ภาพวาด'},
    {id:'chalk',name:'กระดานดำ',emoji:'🏫',cat:'ภาพวาด'},
    {id:'sketch',name:'สเก็ตช์',emoji:'✏️',cat:'ภาพวาด'},
    // --- การ์ตูน ---
    {id:'cartoon-cat',name:'แมวน้อย',emoji:'🐱',cat:'การ์ตูน'},
    {id:'cartoon-bear',name:'หมีน้อย',emoji:'🧸',cat:'การ์ตูน'},
    {id:'cartoon-dino',name:'ไดโนเสาร์',emoji:'🦕',cat:'การ์ตูน'},
    {id:'cartoon-bunny',name:'กระต่าย',emoji:'🐰',cat:'การ์ตูน'},
    {id:'cartoon-panda',name:'แพนด้า',emoji:'🐼',cat:'การ์ตูน'},
    {id:'cartoon-dog',name:'หมาน้อย',emoji:'🐶',cat:'การ์ตูน'},
    // --- ธรรมชาติ ---
    {id:'nature-forest',name:'ป่าไม้',emoji:'🌲',cat:'ธรรมชาติ'},
    {id:'nature-ocean',name:'ทะเล',emoji:'🌊',cat:'ธรรมชาติ'},
    {id:'nature-sakura',name:'ซากุระ',emoji:'🌸',cat:'ธรรมชาติ'},
    {id:'nature-rain',name:'วันฝนตก',emoji:'🌧️',cat:'ธรรมชาติ'},
    {id:'nature-sunset',name:'พระอาทิตย์ตก',emoji:'🌅',cat:'ธรรมชาติ'},
    {id:'nature-snow',name:'หิมะ',emoji:'❄️',cat:'ธรรมชาติ'},
    {id:'nature-garden',name:'สวนดอกไม้',emoji:'🌷',cat:'ธรรมชาติ'},
    {id:'nature-autumn',name:'ใบไม้ร่วง',emoji:'🍂',cat:'ธรรมชาติ'},
    // --- แฟนตาซี ---
    {id:'space',name:'อวกาศ',emoji:'🚀',cat:'แฟนตาซี'},
    {id:'pastel',name:'พาสเทล',emoji:'🦄',cat:'แฟนตาซี'},
    {id:'galaxy',name:'กาแล็กซี่',emoji:'🌌',cat:'แฟนตาซี'},
    {id:'rainbow',name:'สายรุ้ง',emoji:'🌈',cat:'แฟนตาซี'},
    {id:'candy',name:'ลูกอม',emoji:'🍬',cat:'แฟนตาซี'},
    // --- ไลฟ์สไตล์ ---
    {id:'cafe',name:'คาเฟ่',emoji:'☕',cat:'ไลฟ์สไตล์'},
    {id:'money',name:'เศรษฐี',emoji:'💰',cat:'ไลฟ์สไตล์'},
    {id:'kitchen',name:'ครัว',emoji:'🍳',cat:'ไลฟ์สไตล์'},
    {id:'travel',name:'ท่องเที่ยว',emoji:'✈️',cat:'ไลฟ์สไตล์'},
    {id:'music',name:'ดนตรี',emoji:'🎵',cat:'ไลฟ์สไตล์'},
    {id:'sport',name:'กีฬา',emoji:'⚽',cat:'ไลฟ์สไตล์'},
    {id:'book',name:'หนังสือ',emoji:'📚',cat:'ไลฟ์สไตล์'},
    {id:'game',name:'เกม',emoji:'🎮',cat:'ไลฟ์สไตล์'},
    {id:'love',name:'ความรัก',emoji:'💕',cat:'ไลฟ์สไตล์'}
];

var THEME_EMOJIS = {
    'default':null,
    'night':null,
    'paper-white':null,'paper-kraft':null,'paper-grid':null,'paper-dot':null,'paper-line':null,'paper-old':null,
    'watercolor':null,'crayon':null,'chalk':null,'sketch':null,
    'cartoon-cat':['🐱','🐾','😺','🧶'],'cartoon-bear':['🐻','🍯','🌸','🧸'],
    'cartoon-dino':['🦕','🌿','🥚','🦖'],'cartoon-bunny':['🐰','🥕','🌸','💕'],
    'cartoon-panda':['🐼','🎋','💚','🌿'],'cartoon-dog':['🐶','🦴','🐾','❤️'],
    'nature-forest':['🌲','🍃','🌿','🍀'],'nature-ocean':['🌊','🐚','🐠','🐟'],
    'nature-sakura':['🌸','🎀','💮','🌷'],'nature-rain':['🌧️','☂️','💧','🌈'],
    'nature-sunset':['🌅','🌇','🌤️','🧡'],'nature-snow':['❄️','⛄','🌨️','💎'],
    'nature-garden':['🌷','🌻','🌹','🌼'],'nature-autumn':['🍂','🍁','🎃','🌰'],
    'space':['🚀','⭐','🌙','🪐'],'pastel':['🦄','🌈','✨','💜'],
    'galaxy':['🌌','💫','🔮','⭐'],'rainbow':['🌈','❤️','💛','💚'],
    'candy':['🍬','🍭','🧁','🎀'],
    'cafe':['☕','🍰','🧁','🍩'],'money':['💰','💵','💎','🏦'],
    'kitchen':['🍳','🥘','🍕','🧑‍🍳'],'travel':['✈️','🗺️','🏖️','🧳'],
    'music':['🎵','🎸','🎹','🎤'],'sport':['⚽','🏀','🎾','🏃'],
    'book':['📚','📖','✏️','🔖'],'game':['🎮','🕹️','👾','🏆'],
    'love':['💕','💖','💗','🥰']
};

var THEME_BGS = {
    'default':'#E8F4FD',
    'night':'#1A1A2E',
    'paper-white':'#FAFAFA','paper-kraft':'#D7C9AA','paper-grid':'#F5F5F5','paper-dot':'#FAFAF5',
    'paper-line':'#F8F8FF','paper-old':'#F5E6C8',
    'watercolor':'#F0F4FF','crayon':'#FFFDE7','chalk':'#2C2C2C','sketch':'#F5F5F0',
    'cartoon-cat':'#FFF5F5','cartoon-bear':'#FFF8F0','cartoon-dino':'#F0FFF4',
    'cartoon-bunny':'#FFF0F5','cartoon-panda':'#F0FFF0','cartoon-dog':'#FFF8E1',
    'nature-forest':'#F0F7F0','nature-ocean':'#F0F8FF','nature-sakura':'#FFF5F8',
    'nature-rain':'#E8EFF5','nature-sunset':'#FFF3E0','nature-snow':'#F0F8FF',
    'nature-garden':'#FFF8F0','nature-autumn':'#FFF5EB',
    'space':'#F5F3FF','pastel':'#FFF8FC','galaxy':'#F0F0FF','rainbow':'#FFFAF0',
    'candy':'#FFF0F5',
    'cafe':'#FDF8F3','money':'#F5FFF5','kitchen':'#FFFDE7','travel':'#F0FAFF',
    'music':'#F8F0FF','sport':'#F0FFF4','book':'#FFF8F0','game':'#F0F0FF',
    'love':'#FFF0F5'
};

// ===== Color Schemes =====
var COLOR_SCHEMES = [
    {id:'purple', name:'ม่วง',     primary:'#6C63FF', dark:'#5A52D5', light:'#E8E6FF'},
    {id:'blue',   name:'น้ำเงิน',   primary:'#2196F3', dark:'#1976D2', light:'#E3F2FD'},
    {id:'teal',   name:'เขียวน้ำทะเล', primary:'#009688', dark:'#00796B', light:'#E0F2F1'},
    {id:'green',  name:'เขียว',     primary:'#4CAF50', dark:'#388E3C', light:'#E8F5E9'},
    {id:'orange', name:'ส้ม',       primary:'#FF9800', dark:'#F57C00', light:'#FFF3E0'},
    {id:'pink',   name:'ชมพู',      primary:'#E91E63', dark:'#C2185B', light:'#FCE4EC'},
    {id:'red',    name:'แดง',       primary:'#F44336', dark:'#D32F2F', light:'#FFEBEE'},
    {id:'indigo', name:'คราม',      primary:'#3F51B5', dark:'#303F9F', light:'#E8EAF6'},
    {id:'brown',  name:'น้ำตาล',    primary:'#795548', dark:'#5D4037', light:'#EFEBE9'},
    {id:'black',  name:'ดำ',        primary:'#37474F', dark:'#263238', light:'#ECEFF1'}
];

function getCurrentColorScheme() { return localStorage.getItem('expense-app-color')||'270'; }

function hslToHex(h, s, l) {
    s /= 100; l /= 100;
    var a = s * Math.min(l, 1 - l);
    function f(n) {
        var k = (n + h / 30) % 12;
        var color = l - a * Math.max(Math.min(k - 3, 9 - k, 1), -1);
        return Math.round(255 * color).toString(16).padStart(2, '0');
    }
    return '#' + f(0) + f(8) + f(4);
}

function applyColorFromHue(hue) {
    hue = parseInt(hue) || 270;
    var sat = parseInt(localStorage.getItem('expense-app-sat')) || 65;
    applyColorFromHueAndSat(hue, sat);
}

function applyColorScheme(schemeIdOrHue) {
    // Support old preset IDs for backward compat
    var presetMap = {purple:270,blue:210,teal:175,green:130,orange:30,pink:340,red:0,indigo:230,brown:20,black:200};
    var hue = presetMap[schemeIdOrHue];
    if (hue === undefined) hue = parseInt(schemeIdOrHue) || 270;
    applyColorFromHue(hue);
}

function getCurrentTheme() { return localStorage.getItem('expense-app-theme')||'default'; }

function renderThemeBg(themeId) {
    var bgEl=document.getElementById('theme-bg'); if(!bgEl)return;
    bgEl.innerHTML=''; bgEl.style.cssText='';

    // Default: no special bg
    if (themeId === 'default') {
        return;
    }

    // Paper & art themes: CSS patterns
    var patterns = {
        'paper-white': 'background:#FAFAFA;',
        'paper-kraft': 'background:repeating-linear-gradient(0deg,transparent,transparent 19px,rgba(139,90,43,0.08) 20px);background-color:#D7C9AA;',
        'paper-grid': 'background:repeating-linear-gradient(0deg,transparent,transparent 19px,rgba(0,0,200,0.06) 20px),repeating-linear-gradient(90deg,transparent,transparent 19px,rgba(0,0,200,0.06) 20px);background-color:#F5F5F5;',
        'paper-dot': 'background:radial-gradient(circle,rgba(0,0,0,0.08) 1px,transparent 1px);background-size:20px 20px;background-color:#FAFAF5;',
        'paper-line': 'background:repeating-linear-gradient(0deg,transparent,transparent 27px,rgba(100,100,200,0.1) 28px);background-color:#F8F8FF;',
        'paper-old': 'background:linear-gradient(135deg,#F5E6C8 0%,#EDD9A3 50%,#F5E6C8 100%);',
        'watercolor': 'background:radial-gradient(ellipse at 20% 30%,rgba(144,202,249,0.2),transparent 50%),radial-gradient(ellipse at 80% 60%,rgba(244,143,177,0.15),transparent 50%),radial-gradient(ellipse at 50% 80%,rgba(165,214,167,0.15),transparent 50%);background-color:#F0F4FF;',
        'crayon': 'background:repeating-linear-gradient(45deg,rgba(255,235,59,0.05),rgba(255,235,59,0.05) 10px,rgba(244,67,54,0.03) 10px,rgba(244,67,54,0.03) 20px,rgba(33,150,243,0.03) 20px,rgba(33,150,243,0.03) 30px);background-color:#FFFDE7;',
        'chalk': 'background:#2C2C2C;',
        'sketch': 'background:repeating-linear-gradient(0deg,transparent,transparent 3px,rgba(0,0,0,0.015) 3px,rgba(0,0,0,0.015) 4px);background-color:#F5F5F0;'
    };

    if (patterns[themeId]) {
        bgEl.style.cssText = 'position:fixed;top:0;left:0;right:0;bottom:0;pointer-events:none;z-index:0;' + patterns[themeId];
        return;
    }

    // Night: no pattern
    if (themeId === 'night') return;

    // Emoji tile themes
    var emojis = THEME_EMOJIS[themeId];
    if (!emojis) return;

    var canvas=document.createElement('canvas'),size=320;
    canvas.width=size;canvas.height=size;
    var ctx=canvas.getContext('2d');ctx.font='24px serif';ctx.textAlign='center';ctx.textBaseline='middle';
    var cols=5,rows=5,cw=size/cols,ch=size/rows;
    for(var r=0;r<rows;r++)for(var c=0;c<cols;c++){var i=(r*cols+c)%emojis.length;ctx.fillText(emojis[i],(c*cw+cw/2+(r%2?cw/2:0))%size,r*ch+ch/2);}
    var url=canvas.toDataURL();
    bgEl.style.cssText='position:fixed;top:0;left:0;right:0;bottom:0;pointer-events:none;z-index:0;background-image:url('+url+');background-repeat:repeat;background-size:'+size+'px '+size+'px;opacity:0.12;';
}

function applyTheme(themeId) {
    THEMES.forEach(function(t){document.body.classList.remove('theme-'+t.id);});
    if(themeId!=='default')document.body.classList.add('theme-'+themeId);
    renderThemeBg(themeId);
    localStorage.setItem('expense-app-theme',themeId);
}

function showThemePicker() {
    var container=document.getElementById('theme-picker'),cur=getCurrentTheme(),curColor=getCurrentColorScheme();

    // Color scheme section
    var html='<div class="theme-section-title"><i class="fas fa-tint"></i> สี UI หลัก</div>';
    html+='<div class="color-scheme-picker">';
    COLOR_SCHEMES.forEach(function(scheme){
        var isA=curColor===scheme.id;
        html+='<div class="color-scheme-option'+(isA?' active':'')+'" onclick="selectColorScheme(\''+scheme.id+'\')" title="'+scheme.name+'">'
            +'<div class="color-dot" style="background:'+scheme.primary+'"></div>'
            +'<span>'+scheme.name+'</span>'
            +(isA?'<i class="fas fa-check"></i>':'')
            +'</div>';
    });
    html+='</div>';

    // Background theme section
    html+='<div class="theme-section-title" style="margin-top:20px"><i class="fas fa-image"></i> ลายพื้นหลัง</div>';
    html+='<div class="theme-grid">';
    THEMES.forEach(function(theme){
        var isA=cur===theme.id,bg=THEME_BGS[theme.id]||'#F5F5FA',tc=theme.id==='night'?'#E8E8E8':'#2D3436';
        html+='<div class="theme-option '+(isA?'active':'')+'" onclick="selectTheme(\''+theme.id+'\')">'
            +'<div class="theme-preview" style="background:'+bg+'"><span>'+theme.emoji+'</span>'
            +'<div class="theme-name" style="color:'+tc+(theme.id==='night'?';background:rgba(22,33,62,0.85)':'')+'">'+theme.name+'</div>'
            +'<div class="theme-check"><i class="fas fa-check"></i></div></div></div>';
    });
    html+='</div>';

    container.innerHTML=html;
    openModal('theme-modal');
}

function selectColorScheme(schemeId) {
    applyColorScheme(schemeId);
}

function selectTheme(themeId) {
    applyTheme(themeId);
    document.querySelectorAll('.theme-option').forEach(function(el){
        var m=el.getAttribute('onclick').match(/'([^']+)'/);
        el.classList.toggle('active', m&&m[1]===themeId);
    });
    setTimeout(function(){closeModal('theme-modal');},300);
}

// ===== Settings =====
function renderSettingsTab(container) {
    var t = i18n;
    var h = '<div style="padding:0 0 20px">';
    // Family members
    h += '<div class="settings-inline"><h3>👥 '+t.familyMembers+'</h3>';
    h += '<div id="family-members-list-inline"></div>';
    h += '<div class="settings-add-row">';
    h += '<input type="text" id="new-member-inline" placeholder="'+t.memberName+'" class="settings-add-input">';
    h += '<button class="settings-add-btn" onclick="addFamilyMemberInline()">+ เพิ่ม</button>';
    h += '</div></div>';
    // Credit cards
    h += '<div class="settings-inline"><h3>💳 '+t.creditCards+'</h3>';
    h += '<div id="credit-cards-list-inline"></div>';
    h += '<div class="settings-add-row">';
    h += '<input type="text" id="new-card-name-inline" placeholder="'+t.cardName+'" class="settings-add-input" style="flex:2">';
    h += '<input type="text" id="new-card-last4-inline" placeholder="'+t.cardLast4+'" class="settings-add-input" style="flex:1;max-width:80px" maxlength="4">';
    h += '<button class="settings-add-btn" onclick="addCreditCardInline()">+ เพิ่ม</button>';
    h += '</div></div>';
    // Shops
    h += '<div class="settings-inline"><h3>🏪 '+t.shops+'</h3>';
    h += '<div id="shops-list-inline"></div>';
    h += '<div class="settings-add-row">';
    h += '<input type="text" id="new-shop-inline" placeholder="'+t.shopName+'" class="settings-add-input">';
    h += '<button class="settings-add-btn" onclick="addShopInline()">+ เพิ่ม</button>';
    h += '</div></div>';
    h += '</div>';
    container.innerHTML = h;
    renderFamilyMembersInline();
    renderCreditCardsInline();
    renderShopsInline();
}

function renderFamilyMembersInline() {
    var el = document.getElementById('family-members-list-inline'); if(!el) return;
    el.innerHTML = appData.familyMembers.map(function(n,i){
        return '<div class="member-item"><span>👤 '+n+'</span><button class="remove-btn" onclick="removeFamilyMember('+i+');renderSettingsTab(document.getElementById(\'expense-list\'))">🗑️</button></div>';
    }).join('');
}
function addFamilyMemberInline() {
    var inp=document.getElementById('new-member-inline'),n=inp.value.trim(); if(!n)return;
    appData.familyMembers.push(n); saveData(appData); inp.value=''; renderFamilyMembersInline();
}
function renderCreditCardsInline() {
    var el = document.getElementById('credit-cards-list-inline'); if(!el) return;
    el.innerHTML = appData.creditCards.map(function(c,i){
        return '<div class="card-item"><span>💳 '+c.name+' *'+c.last4+'</span><button class="remove-btn" onclick="removeCreditCard('+i+');renderSettingsTab(document.getElementById(\'expense-list\'))">🗑️</button></div>';
    }).join('');
}
function addCreditCardInline() {
    var ni=document.getElementById('new-card-name-inline'),li=document.getElementById('new-card-last4-inline');
    var n=ni.value.trim(),l=li.value.trim(); if(!n)return;
    appData.creditCards.push({id:'cc_'+generateId(),name:n,last4:l||'****'}); saveData(appData); ni.value=''; li.value=''; renderCreditCardsInline();
}
function renderShopsInline() {
    var el = document.getElementById('shops-list-inline'); if(!el) return;
    el.innerHTML = appData.shops.map(function(s,i){
        return '<div class="shop-item"><span>🏪 '+s+'</span><button class="remove-btn" onclick="removeShop('+i+');renderSettingsTab(document.getElementById(\'expense-list\'))">🗑️</button></div>';
    }).join('');
}
function addShopInline() {
    var inp=document.getElementById('new-shop-inline'),n=inp.value.trim(); if(!n)return;
    appData.shops.push(n); saveData(appData); inp.value=''; renderShopsInline();
}

function showSettings() { renderFamilyMembers(); renderCreditCards(); renderShops(); openModal('settings-modal'); }
function renderFamilyMembers() {
    document.getElementById('family-members-list').innerHTML=appData.familyMembers.map(function(n,i){
        return '<div class="member-item"><span><i class="fas fa-user" style="color:var(--primary);margin-right:8px"></i>'+n+'</span><button class="remove-btn" onclick="removeFamilyMember('+i+')"><i class="fas fa-trash-alt"></i></button></div>';
    }).join('');
}
function addFamilyMember() { var inp=document.getElementById('new-member-name'),n=inp.value.trim(); if(!n)return; appData.familyMembers.push(n); saveData(appData); inp.value=''; renderFamilyMembers(); }
function removeFamilyMember(i) { if(appData.familyMembers.length<=1){alert('ต้องมีสมาชิกอย่างน้อย 1 คน');return;} appData.familyMembers.splice(i,1); saveData(appData); renderFamilyMembers(); }

function renderCreditCards() {
    document.getElementById('credit-cards-list').innerHTML=appData.creditCards.map(function(c,i){
        return '<div class="card-item"><span><i class="fas fa-credit-card" style="color:var(--primary);margin-right:8px"></i>'+c.name+' *'+c.last4+'</span><button class="remove-btn" onclick="removeCreditCard('+i+')"><i class="fas fa-trash-alt"></i></button></div>';
    }).join('');
}
function addCreditCard() { var ni=document.getElementById('new-card-name'),li=document.getElementById('new-card-last4'),n=ni.value.trim(),l=li.value.trim(); if(!n)return; appData.creditCards.push({id:'cc_'+generateId(),name:n,last4:l||'****'}); saveData(appData); ni.value=''; li.value=''; renderCreditCards(); }
function removeCreditCard(i) { appData.creditCards.splice(i,1); saveData(appData); renderCreditCards(); }

function renderShops() {
    document.getElementById('shops-list').innerHTML=appData.shops.map(function(s,i){
        return '<div class="shop-item"><span><i class="fas fa-store" style="color:var(--primary);margin-right:8px"></i>'+s+'</span><button class="remove-btn" onclick="removeShop('+i+')"><i class="fas fa-trash-alt"></i></button></div>';
    }).join('');
}
function addShop() { var inp=document.getElementById('new-shop-name'),n=inp.value.trim(); if(!n)return; appData.shops.push(n); saveData(appData); inp.value=''; renderShops(); }
function removeShop(i) { appData.shops.splice(i,1); saveData(appData); renderShops(); }

// ===== Import/Export =====
function exportData() {
    var j=JSON.stringify(appData,null,2),b=new Blob([j],{type:'application/json'}),u=URL.createObjectURL(b),a=document.createElement('a');
    a.href=u;a.download='expense-data-'+getMonthKey(new Date())+'.json';a.click();URL.revokeObjectURL(u);
}
function importData(event) {
    var f=event.target.files[0]; if(!f)return;
    var r=new FileReader();
    r.onload=function(e){try{var d=JSON.parse(e.target.result);if(d.expenses&&Array.isArray(d.expenses)){if(confirm('นำเข้า '+d.expenses.length+' รายการ?')){appData=d;saveData(appData);closeModal('settings-modal');render();alert('สำเร็จ!');}}else{alert('ไฟล์ไม่ถูกต้อง');}}catch(err){alert('อ่านไฟล์ไม่ได้: '+err.message);}};
    r.readAsText(f); event.target.value='';
}
function confirmClearData() {
    if(confirm('ล้างข้อมูลทั้งหมด?')&&confirm('ยืนยันอีกครั้ง?')){appData=getDefaultData();saveData(appData);closeModal('settings-modal');render();}
}

// ===== Modal =====
function openModal(id) { document.getElementById(id).classList.add('active'); document.body.style.overflow='hidden'; }
function closeModal(id) { document.getElementById(id).classList.remove('active'); document.body.style.overflow=''; }

// ===== i18n =====
var LANGS = {
    th: {
        appTitle: 'รายจ่ายครอบครัว',
        settingsTitle: 'ตั้งค่า',
        theme: 'ธีมพื้นหลัง', color: 'สี UI', darkMode: 'โหมดมืด', language: 'ภาษา',
        expenses: 'รายจ่าย', installments: 'ผ่อนชำระ', summary: 'สรุป', myData: 'ข้อมูลของฉัน',
        totalExpense: 'รวมทั้งหมด', myExpense: 'รายจ่ายของฉัน',
        familyMembers: 'สมาชิกครอบครัว', creditCards: 'บัตรเครดิต', shops: 'ร้านค้าที่ใช้บ่อย',
        memberName: 'ชื่อสมาชิก', cardName: 'ชื่อบัตร', cardLast4: '4 ตัวท้าย', shopName: 'ชื่อร้านค้า',
        addExpense: 'เพิ่มรายจ่าย', editExpense: 'แก้ไขรายจ่าย',
        itemName: 'รายการ', amount: 'จำนวนเงิน (บาท)', channel: 'ช่องทางจ่าย',
        cash: 'เงินสด', credit: 'บัตรเครดิต', shopee: 'Shopee',
        shop: 'ร้านค้า / แหล่งซื้อ', date: 'วันที่',
        installment: 'การผ่อนชำระ', installMonths: 'ผ่อน (เดือน)',
        splitExpense: 'หารค่าใช้จ่าย', selectMembers: 'เลือกคนที่หารด้วย',
        shareToFamily: 'แชร์ให้ครอบครัวทราบ',
        save: 'บันทึก', update: 'อัปเดต', delete: 'ลบรายการ',
        edit: 'แก้ไข', paid: 'จ่ายแล้ว', unpaid: 'ยังไม่จ่าย', share: 'แชร์', delBtn: 'ลบ',
        noExpenses: 'ยังไม่มีรายจ่ายเดือนนี้', tapAdd: 'กดปุ่ม + เพื่อเพิ่มรายการ',
        on: 'เปิด', off: 'ปิด',
        expenseOf: 'รายจ่ายของ', collect: 'เรียกเก็บ',
        perPerson: 'คนละ', splitWith: 'หาร', people: 'คน',
        monthlyAmount: 'ยอดต่อเดือน',
        byChannel: 'แยกตามช่องทาง', byCard: 'แยกตามบัตรเครดิต', byShop: 'แยกตามร้านค้า',
        total: 'รวม', totalCard: 'รวมบัตรเครดิต', summaryTotal: 'สรุปยอดรวม'
    },
    en: {
        appTitle: 'Family Expenses',
        settingsTitle: 'Settings',
        theme: 'Background Theme', color: 'UI Color', darkMode: 'Dark Mode', language: 'Language',
        expenses: 'Expenses', installments: 'Installments', summary: 'Summary', myData: 'My Data',
        totalExpense: 'Total', myExpense: 'My Expenses',
        familyMembers: 'Family Members', creditCards: 'Credit Cards', shops: 'Frequent Shops',
        memberName: 'Member name', cardName: 'Card name', cardLast4: 'Last 4', shopName: 'Shop name',
        addExpense: 'Add Expense', editExpense: 'Edit Expense',
        itemName: 'Item', amount: 'Amount (THB)', channel: 'Payment',
        cash: 'Cash', credit: 'Credit Card', shopee: 'Shopee',
        shop: 'Shop / Source', date: 'Date',
        installment: 'Installment', installMonths: 'Months',
        splitExpense: 'Split Expense', selectMembers: 'Select members to split',
        shareToFamily: 'Share with family',
        save: 'Save', update: 'Update', delete: 'Delete',
        edit: 'Edit', paid: 'Paid', unpaid: 'Unpaid', share: 'Share', delBtn: 'Delete',
        noExpenses: 'No expenses this month', tapAdd: 'Tap + to add',
        on: 'On', off: 'Off',
        expenseOf: 'Expenses of ', collect: 'Collect',
        perPerson: 'each', splitWith: 'Split', people: '',
        monthlyAmount: 'Monthly',
        byChannel: 'By Channel', byCard: 'By Credit Card', byShop: 'By Shop',
        total: 'Total', totalCard: 'Total Cards', summaryTotal: 'Summary'
    }
};

var currentLang = localStorage.getItem('expense-app-lang') || 'th';
var i18n = LANGS[currentLang];

function setLang(lang) {
    currentLang = lang;
    i18n = LANGS[lang];
    localStorage.setItem('expense-app-lang', lang);
    applyI18n();
    render();
}

function applyI18n() {
    var t = i18n;
    // Top bar
    var title = document.getElementById('page-title'); if(title) title.textContent = t.appTitle;
    // Bottom nav
    var navBtns = document.querySelectorAll('.nav-btn[data-tab]');
    navBtns.forEach(function(btn){
        var tab = btn.dataset.tab;
        var span = btn.querySelector('span');
        if(!span) return;
        if(tab==='expenses') span.textContent = t.expenses;
        if(tab==='installments') span.textContent = t.installments;
        if(tab==='summary') span.textContent = t.summary;
        if(tab==='settings') span.textContent = t.myData;
    });
    // Summary cards
    var myLabel = document.querySelector('.summary-card.my-share .card-label');
    if(myLabel) myLabel.textContent = t.myExpense;
    var totalLabel = document.querySelector('.summary-card.total .card-label');
    if(totalLabel) totalLabel.textContent = t.totalExpense;
}

// ===== App Settings Modal (⚙️) =====
function showSettingsModal() {
    var t = i18n;
    var body = document.getElementById('app-settings-body');
    var curTheme = getCurrentTheme();
    var isDark = curTheme === 'night' || curTheme === 'chalk' || curTheme === 'galaxy';

    // Hand-drawn SVG icons for settings
    var svgTheme = '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="3"/><circle cx="8.5" cy="8.5" r="2"/><path d="M21 15L16 10L5 21"/></svg>';
    var svgColor = '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2C12 2 5 10 5 14.5C5 18.6 8.1 22 12 22C15.9 22 19 18.6 19 14.5C19 10 12 2 12 2Z"/><circle cx="10" cy="16" r="1.5" fill="#EF9A9A" stroke="none"/><circle cx="14" cy="14" r="1.5" fill="#90CAF9" stroke="none"/><circle cx="12" cy="18" r="1.5" fill="#A5D6A7" stroke="none"/></svg>';
    var svgMoon = '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M20 14C19 17.5 15.5 20 11.5 20C6.8 20 3 16.2 3 11.5C3 7.5 5.5 4 9 3C7.5 5.5 7.5 9 9.5 12C11.5 15 15 16.5 18 15.5"/><circle cx="18" cy="5" r="1" fill="currentColor" stroke="none"/><circle cx="21" cy="9" r="0.7" fill="currentColor" stroke="none"/></svg>';
    var svgGlobe = '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><ellipse cx="12" cy="12" rx="4" ry="9"/><line x1="3" y1="9" x2="21" y2="9"/><line x1="3" y1="15" x2="21" y2="15"/></svg>';
    var svgArrow = '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 4L17 12L9 20"/></svg>';

    var h = '';

    // 1. Theme
    h += '<div class="setting-row" onclick="showThemeSection()">'
        +'<div class="setting-left">'+svgTheme+'<span>'+t.theme+'</span></div>'
        +'<span class="setting-arrow">'+svgArrow+'</span></div>';

    // 2. Color
    h += '<div class="setting-row" onclick="showColorSection()">'
        +'<div class="setting-left">'+svgColor+'<span>'+t.color+'</span></div>'
        +'<span class="setting-arrow">'+svgArrow+'</span></div>';

    // 3. Dark mode toggle
    h += '<div class="setting-row" onclick="toggleDarkMode()">'
        +'<div class="setting-left">'+svgMoon+'<span>'+t.darkMode+'</span></div>'
        +'<div class="toggle-switch'+(isDark?' on':'')+'"><div class="toggle-knob"></div></div></div>';

    // 4. Language
    h += '<div class="setting-row" onclick="toggleLang()">'
        +'<div class="setting-left">'+svgGlobe+'<span>'+t.language+'</span></div>'
        +'<span class="setting-value">'+(currentLang==='th'?'ไทย':'English')+'</span></div>';

    // 5. Current user + Logout
    var svgLogout = '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M9 21H5C4 21 3 20 3 19V5C3 4 4 3 5 3H9"/><path d="M16 17L21 12L16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>';
    var user = getCurrentUser();
    h += '<div class="setting-row" onclick="logout()">'
        +'<div class="setting-left">'+svgLogout+'<span>ออกจากระบบ (' + user + ')</span></div>'
        +'<span class="setting-arrow" style="color:var(--danger)">→</span></div>';

    body.innerHTML = h;

    var titleEl = document.querySelector('#app-settings-modal .modal-header h2');
    if(titleEl) titleEl.textContent = t.settingsTitle;

    openModal('app-settings-modal');
}

function showThemeSection() {
    closeModal('app-settings-modal');
    var body = document.getElementById('app-settings-body');
    var curTheme = getCurrentTheme();
    var cats = {};
    THEMES.forEach(function(t){ var c=t.cat||'อื่นๆ'; if(!cats[c])cats[c]=[]; cats[c].push(t); });
    var h = '';
    Object.entries(cats).forEach(function(entry) {
        h += '<div class="theme-cat-label">' + entry[0] + '</div>';
        h += '<div class="theme-grid">';
        entry[1].forEach(function(theme) {
            var isA=curTheme===theme.id, bg=THEME_BGS[theme.id]||'#F5F5FA';
            var isDark = theme.id==='night'||theme.id==='chalk'||theme.id==='galaxy';
            var tc = isDark ? '#E8E8E8' : '#2D3436';
            h+='<div class="theme-option '+(isA?'active':'')+'" onclick="selectTheme(\''+theme.id+'\');showThemeSection()">'
                +'<div class="theme-preview" style="background:'+bg+'"><span>'+theme.emoji+'</span>'
                +'<div class="theme-name" style="color:'+tc+(isDark?';background:rgba(30,30,30,0.85)':'')+'">'+theme.name+'</div>'
                +'<div class="theme-check">✓</div></div></div>';
        });
        h += '</div>';
    });
    h += '<button class="btn-secondary" onclick="showSettingsModal()" style="margin-top:16px">\u2190 '+i18n.settingsTitle+'</button>';
    body.innerHTML = h;
    openModal('app-settings-modal');
}

function showColorSection() {
    closeModal('app-settings-modal');
    var body = document.getElementById('app-settings-body');
    var curHue = parseInt(localStorage.getItem('expense-app-color')) || 270;

    var h = '<div class="color-slider-section">';
    // Preview circle
    h += '<div class="color-preview-row">';
    h += '<div class="color-preview-circle" id="color-preview-circle" style="background:hsl('+curHue+',65%,55%)"></div>';
    h += '<span class="color-preview-label" id="color-preview-label">'+curHue+'°</span>';
    h += '</div>';

    // Hue slider
    h += '<div class="color-slider-wrap">';
    h += '<input type="range" id="hue-slider" class="hue-slider" min="0" max="360" value="'+curHue+'" oninput="onHueSlide(this.value)">';
    h += '</div>';

    // Quick presets
    h += '<div class="color-presets">';
    var presets = [
        {hue:0,name:'แดง'},{hue:30,name:'ส้ม'},{hue:50,name:'ทอง'},{hue:130,name:'เขียว'},
        {hue:175,name:'เขียวน้ำทะเล'},{hue:210,name:'น้ำเงิน'},{hue:230,name:'คราม'},
        {hue:270,name:'ม่วง'},{hue:300,name:'ม่วงชมพู'},{hue:340,name:'ชมพู'}
    ];
    presets.forEach(function(p) {
        var isA = Math.abs(curHue - p.hue) < 15;
        h += '<button class="color-preset-btn'+(isA?' active':'')+'" style="background:hsl('+p.hue+',65%,55%)" onclick="selectHuePreset('+p.hue+')" title="'+p.name+'"></button>';
    });
    h += '</div>';

    // Saturation slider
    h += '<div class="color-sub-label">ความเข้ม</div>';
    var curSat = parseInt(localStorage.getItem('expense-app-sat')) || 65;
    h += '<div class="color-slider-wrap">';
    h += '<input type="range" id="sat-slider" class="sat-slider" min="20" max="100" value="'+curSat+'" oninput="onSatSlide(this.value)" style="--hue:'+curHue+'">';
    h += '</div>';

    // Back button
    h += '<button class="btn-secondary" onclick="showSettingsModal()" style="margin-top:16px">← '+i18n.settingsTitle+'</button>';
    h += '</div>';

    body.innerHTML = h;
    openModal('app-settings-modal');
}

function onHueSlide(val) {
    var hue = parseInt(val);
    var sat = parseInt(document.getElementById('sat-slider').value) || 65;
    applyColorFromHueAndSat(hue, sat);
    var circle = document.getElementById('color-preview-circle');
    var label = document.getElementById('color-preview-label');
    if(circle) circle.style.background = 'hsl('+hue+','+sat+'%,55%)';
    if(label) label.textContent = hue + '°';
    // Update sat slider hue
    var satSlider = document.getElementById('sat-slider');
    if(satSlider) satSlider.style.setProperty('--hue', hue);
    // Update preset active
    document.querySelectorAll('.color-preset-btn').forEach(function(btn){ btn.classList.remove('active'); });
}

function onSatSlide(val) {
    var sat = parseInt(val);
    var hue = parseInt(document.getElementById('hue-slider').value) || 270;
    applyColorFromHueAndSat(hue, sat);
    var circle = document.getElementById('color-preview-circle');
    if(circle) circle.style.background = 'hsl('+hue+','+sat+'%,55%)';
}

function selectHuePreset(hue) {
    document.getElementById('hue-slider').value = hue;
    onHueSlide(hue);
    document.querySelectorAll('.color-preset-btn').forEach(function(btn){
        var btnHue = parseInt(btn.getAttribute('onclick').match(/\d+/)[0]);
        btn.classList.toggle('active', Math.abs(btnHue - hue) < 15);
    });
}

function applyColorFromHueAndSat(hue, sat) {
    hue = parseInt(hue) || 270;
    sat = parseInt(sat) || 65;
    var primary = hslToHex(hue, sat, 55);
    var dark = hslToHex(hue, sat, 42);
    var light = hslToHex(hue, Math.max(20, sat - 5), 92);
    document.documentElement.style.setProperty('--primary', primary);
    document.documentElement.style.setProperty('--primary-dark', dark);
    document.documentElement.style.setProperty('--primary-light', light);
    localStorage.setItem('expense-app-color', String(hue));
    localStorage.setItem('expense-app-sat', String(sat));
}

function toggleDarkMode() {
    var isDark = getCurrentTheme() === 'night';
    if (isDark) {
        applyTheme('default');
    } else {
        applyTheme('night');
    }
    showSettingsModal(); // refresh
}

function toggleLang() {
    setLang(currentLang === 'th' ? 'en' : 'th');
    showSettingsModal(); // refresh
}

// ===== Main Render =====
function render() {
    updateMonthDisplay();
    var mk=getMonthKey(currentDate), exps=getExpensesForMonth(mk);
    var sv=currentTab==='expenses'||currentTab==='summary';
    document.getElementById('summary-cards').style.display=sv?'grid':'none';
    document.getElementById('channel-summary').style.display=currentTab==='expenses'?'flex':'none';
    document.getElementById('credit-card-summary').style.display='none';
    renderSummary(exps);
    renderExpenseList(exps);
}

// ===== Login / Logout =====
function showLoginScreen() {
    var app = document.getElementById('app');
    var accounts = getAccounts();
    var t = i18n || LANGS.th;

    var h = '<div class="login-screen">';
    h += '<div class="login-card">';
    h += '<div class="login-logo">💰</div>';
    h += '<h1 class="login-title">' + (t.appTitle || 'รายจ่ายครอบครัว') + '</h1>';

    if (accounts.length > 0) {
        h += '<p class="login-subtitle">เลือกบัญชี</p>';
        h += '<div class="login-accounts">';
        accounts.forEach(function(name) {
            var initial = name.charAt(0).toUpperCase();
            h += '<button class="login-account-btn" onclick="loginAs(\'' + name.replace(/'/g, "\\'") + '\')">'
                + '<span class="login-avatar">' + initial + '</span>'
                + '<span>' + name + '</span>'
                + '<span class="login-arrow">→</span>'
                + '</button>';
        });
        h += '</div>';
        h += '<div class="login-divider"><span>หรือ</span></div>';
    }

    h += '<p class="login-subtitle">สร้างบัญชีใหม่</p>';
    h += '<div class="login-form">';
    h += '<input type="text" id="login-name-input" placeholder="ใส่ชื่อของคุณ" class="login-input" onkeydown="if(event.key===\'Enter\')createAccount()">';
    h += '<button class="login-btn" onclick="createAccount()">เข้าใช้งาน</button>';
    h += '</div>';

    h += '</div></div>';

    // Hide main UI, show login
    document.querySelectorAll('#app > *:not(.login-screen)').forEach(function(el) { el.style.display = 'none'; });
    // Remove old login screen if exists
    var old = app.querySelector('.login-screen');
    if (old) old.remove();
    app.insertAdjacentHTML('afterbegin', h);
}

function createAccount() {
    var input = document.getElementById('login-name-input');
    var name = input.value.trim();
    if (!name) { input.focus(); return; }

    var accounts = getAccounts();
    if (accounts.indexOf(name) === -1) {
        accounts.push(name);
        saveAccounts(accounts);
    }
    loginAs(name);
}

function loginAs(name) {
    setCurrentUser(name);
    appData = loadData();

    // Remove login screen, show main UI
    var loginScreen = document.querySelector('.login-screen');
    if (loginScreen) loginScreen.remove();
    document.querySelectorAll('#app > *').forEach(function(el) { el.style.display = ''; });

    // Update title with user name
    updateUserDisplay();
    render();
}

function logout() {
    setCurrentUser('');
    showLoginScreen();
}

function deleteAccount(name) {
    if (!confirm('ลบบัญชี "' + name + '"? ข้อมูลทั้งหมดจะหายไป')) return;
    var accounts = getAccounts().filter(function(a) { return a !== name; });
    saveAccounts(accounts);
    // Remove user data
    var key = getUserStorageKey(name);
    localStorage.removeItem(key);
    // If deleting current user, logout
    if (getCurrentUser() === name) {
        setCurrentUser('');
    }
    showLoginScreen();
}

function updateUserDisplay() {
    var user = getCurrentUser();
    var titleEl = document.getElementById('page-title');
    if (titleEl && user) {
        titleEl.textContent = (i18n.appTitle || 'รายจ่ายครอบครัว');
    }
}

// ===== Init =====
document.addEventListener('DOMContentLoaded', function() {
    // Apply theme and color
    applyTheme(getCurrentTheme());
    applyColorScheme(getCurrentColorScheme());
    applyI18n();

    // Backdrop click to close modals
    document.querySelectorAll('.modal').forEach(function(m){
        m.addEventListener('click',function(e){if(e.target===this){this.classList.remove('active');document.body.style.overflow='';}});
    });

    // Form event listeners
    var amtEl=document.getElementById('exp-amount');
    var instEl=document.getElementById('exp-installments');
    var chEl=document.getElementById('exp-channel');
    if(amtEl) amtEl.addEventListener('input',function(){updateInstallmentPreview();updateSplitPreview();});
    if(instEl) instEl.addEventListener('input',function(){updateInstallmentPreview();updateSplitPreview();});
    if(chEl) chEl.addEventListener('change',function(){document.getElementById('credit-card-group').style.display=this.value==='credit'?'block':'none';});

    // Shop dropdown change
    var shopEl = document.getElementById('exp-shop');
    if(shopEl) shopEl.addEventListener('change', function(){
        var customGroup = document.getElementById('custom-shop-group');
        if(this.value === '__other__') {
            customGroup.style.display = 'block';
            document.getElementById('exp-shop-custom').focus();
        } else {
            customGroup.style.display = 'none';
        }
    });

    // Check login
    var user = getCurrentUser();
    if (!user) {
        showLoginScreen();
    } else {
        appData = loadData();
        updateUserDisplay();
        render();
    }
});
