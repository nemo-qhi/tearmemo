'use strict';

(() => {
  const root = document.getElementById('chigiri-notes');
  const query = selector => root.querySelector(selector);
  const rows = query('#cn-rows');
  const board = query('#cn-canvas');
  const cards = query('#cn-cards');
  const ink = query('#cn-ink');
  const wires = query('#cn-wires');
  const title = query('#cn-title');
  const library = query('#cn-notebooks');
  const color = query('#cn-ink-color');
  const background = query('#cn-background');
  const texture = query('#cn-texture');
  const toolButtons = [...root.querySelectorAll('[data-tool]')].filter(element => element.tagName === 'BUTTON');
  const clone = object => JSON.parse(JSON.stringify(object));
  const uid = () => 'n' + Math.random().toString(36).slice(2, 11);
  const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
  const colors = [
    ['#285c49', '#a8dbc1'], ['#285993', '#a9caff'], ['#a13f32', '#ffa898']
  ];
  const markerColors = [
    ['#f6ca36', '#f7ce4e'], ['#5bd89b', '#67e4a6'], ['#f58fb4', '#fb9abf']
  ];
  const boardColors = [
    ['標準', 'var(--cn-bg)'], ['砂色', 'light-dark(#f5ead8,#393026)'],
    ['ミント', 'light-dark(#e5f1e9,#23352e)'], ['空色', 'light-dark(#e6eff8,#263440)'],
    ['藤色', 'light-dark(#eee8f7,#372e43)']
  ];
  const paperColors = [
    ['白', 'var(--cn-paper)'], ['黄', 'light-dark(#fff0b9,#41381d)'],
    ['桃', 'light-dark(#fce1e8,#472d38)'], ['緑', 'light-dark(#dff2dd,#293e2e)'],
    ['青', 'light-dark(#deedf9,#293849)'], ['紫', 'light-dark(#eee2f9,#3b3048)']
  ];
  const penLabels = ['深緑','青','朱色'];
  const markerLabels = ['黄色','ミント','ピンク'];
  const storageKey = 'chigiri-notes.workspace.v1:' + new URL('.', location.href).pathname;

  function createNote(id, name) {
    return {id, title:name, mode:'list', link:true, selected:[], notes:[], cards:[], edges:[], strokes:[], decorations:[]};
  }

  const sample = createNote('weekend', '週末の小さな計画');
  sample.notes = [
    {id:'n1', text:'朝はパン屋さんに寄り道する'},
    {id:'n2', text:'読みかけの本を持っていく'},
    {id:'n3', text:'川沿いで、のんびりコーヒー'},
    {id:'n4', text:'気になるお店を地図にまとめる'},
    {id:'n5', text:'パン屋さんの営業時間を調べる', done:true}
  ];
  sample.selected = ['n3','n4'];
  sample.cards = [
    {id:'c1', source:'n1', linked:true, text:sample.notes[0].text, x:.05, y:24},
    {id:'c2', source:'n2', linked:true, text:sample.notes[1].text, x:.94, y:220}
  ];
  const ideas = createNote('ideas', '思いついたこと');
  ideas.notes = [{id:'i1', text:'気になった本をここに書く'}];
  const defaults = {active:sample.id, notebooks:[sample, ideas]};

  function restoreNotebook(note) {
    delete note.hideDone;
    if (note.texture === 'torn') note.texture = 'plain';
    note.strokes = (note.strokes || []).map(mark =>
      Array.isArray(mark) ? {id:uid(),color:mark[0],path:mark[1]} : mark);
    return note;
  }

  function loadWorkspace() {
    try {
      const saved = JSON.parse(localStorage.getItem(storageKey));
      if (Array.isArray(saved?.notebooks) && saved.notebooks.some(note => note.id === saved.active)) {
        saved.notebooks.forEach(restoreNotebook);
        return saved;
      }
    } catch {
      // Start with examples if browser storage is unavailable or unreadable.
    }
    return clone(defaults);
  }

  const workspace = loadWorkspace();
  const current = () => workspace.notebooks.find(note => note.id === workspace.active);
  const undo = new Map();
  const hints = {
    move:'カードの余白や素材を押すと調整枠が出ます。ドラッグで移動できます。',
    connect:'線で結びたいカードを2枚選びます。同じ組み合わせを選ぶと線を外せます。',
    pen:'カードの上から描くとカードに付き、余白から描くと独立します。',
    marker:'半透明のインクで、文字の上にも線を引けます。',
    select:'余白に描いた線を押して選び、そのままドラッグします。',
    erase:'手書きの線をなぞると、一筆ずつ消せます。'
  };
  let tool = 'move';
  let firstCard = null;
  let stroke = null;
  let selectedInk = null;
  let inkDrag = null;
  const activeShades = {pen:0, marker:0};
  let drag = null;
  let saveTimer = null;
  let libraryOverride;

  function element(tag, className, value) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (value !== undefined) node.textContent = value;
    return node;
  }

  function status(message) {
    query('#cn-status').textContent = message;
  }

  function fillOptions(select, names, value) {
    select.replaceChildren(...names.map((name,index) => new Option(name,String(index))));
    select.value = String(value ?? 0);
  }

  function applyBackground() {
    const shade = current().background ?? 0;
    const swatch = boardColors[shade][1];
    background.value = String(shade);
    background.style.setProperty('--cn-swatch',swatch);
    board.style.setProperty('--cn-board-color',swatch);
  }

  function seededRandom(seed) {
    return () => {
      seed = (Math.imul(seed,1664525) + 1013904223) >>> 0;
      return seed / 4294967296;
    };
  }

  function paperGrain(isKraft) {
    const tile = document.createElement('canvas');
    tile.width = 128;
    tile.height = 128;
    const context = tile.getContext('2d');
    const random = seededRandom(isKraft ? 39647 : 63493);
    const image = context.createImageData(tile.width,tile.height);
    for (let i = 0; i < image.data.length; i += 4) {
      const shade = random() < .43 ? 52 : 255;
      image.data[i] = image.data[i+1] = image.data[i+2] = shade;
      image.data[i+3] = Math.round(random()*(isKraft ? 31 : 15));
    }
    context.putImageData(image,0,0);
    const fiberCount = isKraft ? 320 : 185;
    for (let i = 0; i < fiberCount; i++) {
      const x = random()*tile.width;
      const y = random()*tile.height;
      const length = 1.2 + random()*(isKraft ? 7.6 : 4.2);
      context.strokeStyle = i%3 ? (isKraft ? 'rgb(78 42 16 / 0.24)' : 'rgb(92 67 36 / 0.11)') : 'rgb(255 255 255 / 0.36)';
      context.lineWidth = .35 + random()*.48;
      context.beginPath();
      context.moveTo(x,y);
      context.quadraticCurveTo(x+length/2,y-1,x+length,y+(random()-.5)*3);
      context.stroke();
    }
    return 'url("' + tile.toDataURL() + '")';
  }

  function applyTexture() {
    const finish = current().texture ?? 'plain';
    if (finish === 'fiber' || finish === 'kraft') {
      const grain = finish === 'kraft' ? '--cn-kraft-grain' : '--cn-grain';
      if (!root.style.getPropertyValue(grain)) {
        root.style.setProperty(grain,paperGrain(finish === 'kraft'));
      }
    }
    texture.value = finish;
    board.dataset.texture = finish;
    layout();
  }

  texture.onchange = () => {
    backup();
    current().texture = texture.value;
    applyTexture();
    persist();
  };

  fillOptions(background,boardColors.map(([name]) => name),0);
  background.onchange = () => {
    backup();
    current().background = Number(background.value);
    applyBackground();
    persist();
  };

  function persist(delayed = false) {
    clearTimeout(saveTimer);
    if (delayed) {
      saveTimer = setTimeout(persist, 300);
      return;
    }
    saveTimer = null;
    try {
      localStorage.setItem(storageKey, JSON.stringify(workspace));
    } catch {
      status('変更を保存できませんでした。この画面では引き続き編集できます。');
    }
  }

  function backup(snapshot = clone(current())) {
    undo.set(snapshot.id, snapshot);
    query('#cn-undo').disabled = false;
  }

  function recordEditing(input, apply) {
    let started = false;
    input.addEventListener('focus', () => { started = false; });
    input.addEventListener('input', () => {
      if (!started) backup();
      started = true;
      apply(input.value);
      persist(true);
    });
  }

  function renderLibrary() {
    library.replaceChildren();
    for (const note of workspace.notebooks) {
      const button = element('button', 'cn-notebook');
      button.type = 'button';
      button.dataset.noteId = note.id;
      if (note.id === workspace.active) button.setAttribute('aria-current', 'true');
      button.append(element('span', '', note.title.trim() || 'タイトルなし'),
        element('span', '', previewText(note)));
      button.onclick = () => {
        if (workspace.active !== note.id) {
          workspace.active = note.id;
          setTool('move');
          render();
          status('');
          persist();
        }
        if (compact.matches) {
          libraryOverride = false;
          renderLibraryVisibility();
          query('#cn-library-toggle').focus();
        } else {
          library.querySelector('[aria-current]').focus();
        }
      };
      library.append(button);
    }
    query('#cn-new').disabled = workspace.notebooks.length >= 8;
  }

  const compact = matchMedia('(max-width: 720px)');
  function renderLibraryVisibility() {
    const show = libraryOverride ?? !compact.matches;
    library.hidden = !show;
    query('#cn-library-toggle').setAttribute('aria-expanded', String(show));
  }
  compact.addEventListener('change', () => {
    libraryOverride = undefined;
    renderLibraryVisibility();
  });
  query('#cn-library-toggle').onclick = () => {
    libraryOverride = library.hidden;
    renderLibraryVisibility();
  };
  query('#cn-new').onclick = () => {
    const note = createNote(uid(), 'タイトルなし');
    note.notes.push({id:uid(), text:''});
    workspace.notebooks.unshift(note);
    workspace.active = note.id;
    setTool('move');
    render();
    title.focus();
    title.select();
    status('タイトルを入力すると、メモ一覧に反映されます。');
    persist();
  };
  recordEditing(title, value => {
    current().title = value;
    const label = library.querySelector('[aria-current] span');
    if (label) label.textContent = value.trim() || 'タイトルなし';
  });
  title.addEventListener('keydown', event => {
    if (event.key === 'Enter' && !event.isComposing) {
      event.preventDefault();
      if (current().mode === 'list') rows.querySelector('input[type=text]')?.focus();
      else title.blur();
    }
  });

  function setMode(mode) {
    current().mode = mode;
    query('#cn-list').hidden = mode !== 'list';
    query('#cn-board').hidden = mode !== 'board';
    if (mode === 'list') clearBoardSelection();
    for (const name of ['list','board']) {
      query('#cn-' + name + '-tab').setAttribute('aria-selected', String(name === mode));
    }
    if (mode === 'board') requestAnimationFrame(layout);
  }

  function updateCounts() {
    const note = current();
    query('#cn-count').textContent = note.cards.length;
    const selected = tearableItems(note).length;
    query('#cn-selected').textContent = selected ? selected + '件を選択中' : '項目を選んでちぎる';
    query('#cn-tear').disabled = !selected || note.cards.length >= 20;
    query('#cn-add').disabled = note.notes.length >= 20;
  }

  function tearableItems(note) {
    return note.notes.filter(item => note.selected.includes(item.id) && item.text.trim());
  }

  function previewText(note) {
    return note.notes.find(item => !item.done && item.text.trim())?.text ||
      note.notes.find(item => item.text.trim())?.text || '項目なし';
  }

  function updatePreview() {
    const preview = library.querySelector('[aria-current] span:last-child');
    if (preview) preview.textContent = previewText(current());
  }

  function updateText(source, text, activeInput) {
    const note = current();
    note.notes.find(item => item.id === source).text = text;
    for (const card of note.cards) {
      if (card.linked && card.source === source) card.text = text;
    }
    for (const input of root.querySelectorAll('[data-source]')) {
      if (input.dataset.source !== source || input === activeInput) continue;
      input.value = text;
      if (input.tagName==='TEXTAREA') fitPaperText(input);
    }
    updatePreview();
    updateCounts();
  }

  function renderRows() {
    const note = current();
    rows.replaceChildren();
    const pending = note.notes.filter(item => !item.done);
    const finished = note.notes.filter(item => item.done);
    const ordered = [...pending,...finished];
    ordered.forEach((item, index) => {
      if (item.done && index === pending.length) rows.append(element('div','cn-completed-divider','完了済み'));
      const row = element('div', 'cn-row');
      row.dataset.itemId = item.id;
      row.toggleAttribute('data-done',Boolean(item.done));
      const completed = element('input');
      completed.type = 'checkbox';
      completed.className = 'cn-done-check';
      completed.checked = Boolean(item.done);
      completed.setAttribute('aria-label','メモ' + (index+1) + 'の完了');
      completed.onchange = () => {
        backup();
        item.done = completed.checked;
        renderRows();
        renderCards();
        updatePreview();
        const checkbox = rows.querySelector('[data-item-id="' + item.id + '"] .cn-done-check');
        checkbox.focus();
        status(item.done ? '完了にしました。' : '未完了に戻しました。');
        persist();
      };
      const completionLabel = element('label','cn-rowcheck');
      completionLabel.append(completed);

      const check = element('input');
      check.type = 'checkbox';
      check.checked = note.selected.includes(item.id);
      check.setAttribute('aria-label', 'メモ' + (index+1) + 'を選択');
      check.onchange = () => {
        note.selected = check.checked ? [...note.selected,item.id] : note.selected.filter(id => id !== item.id);
        updateCounts();
        persist();
      };
      const tearLabel = element('label','cn-rowcheck cn-tearcheck');
      tearLabel.append(check);
      const input = element('input');
      input.type = 'text';
      input.value = item.text;
      input.placeholder = 'メモを書く';
      input.maxLength = 80;
      input.dataset.source = item.id;
      input.setAttribute('aria-label', 'メモ' + (index+1));
      recordEditing(input, value => updateText(item.id, value, input));
      input.onkeydown = event => {
        if (event.key === 'Enter' && !event.isComposing) {
          event.preventDefault();
          add(item.id);
        }
      };
      const content = element('div','cn-rowmain');
      content.append(input);
      if (note.cards.some(card => card.source === item.id && card.linked)) {
        content.append(element('span', 'cn-linked', '連動中'));
      }
      if (item.done) {
        const remove = element('button','cn-delete-task','削除');
        remove.type = 'button';
        remove.setAttribute('aria-label','完了したメモを削除: ' + (item.text.trim() || '空欄'));
        remove.onclick = () => deleteCompleted(item);
        content.append(remove);
      }
      row.append(completionLabel,content,tearLabel);
      rows.append(row);
    });
    updateCounts();
  }

  function deleteCompleted(item) {
    const note = current();
    backup();
    note.notes = note.notes.filter(entry => entry.id !== item.id);
    note.selected = note.selected.filter(id => id !== item.id);
    for (const card of note.cards.filter(entry => entry.source === item.id)) {
      if (card.linked) card.done = true;
      card.linked = false;
      delete card.source;
    }
    renderRows();
    renderCards();
    updatePreview();
    query('#cn-undo').focus();
    status('完了済みの項目を削除しました。');
    persist();
  }

  function add(after) {
    const note = current();
    if (note.notes.length >= 20) return;
    backup();
    const item = {id:uid(), text:''};
    const afterPending = after ? note.notes.findIndex(entry => entry.id === after && !entry.done) : -1;
    const index = afterPending >= 0 ? afterPending + 1 : note.notes.length;
    note.notes.splice(index,0,item);
    renderRows();
    rows.querySelector('[data-source="' + item.id + '"]').focus();
    persist();
  }

  function updateTool() {
    board.dataset.tool = tool;
    for (const button of toolButtons) button.setAttribute('aria-pressed', String(button.dataset.tool === tool));
    const inking = tool === 'pen' || tool === 'marker';
    query('#cn-ink-choice').hidden = !inking;
    if (inking) {
      color.setAttribute('aria-label',tool === 'marker' ? 'マーカーの色' : 'ペンの色');
      fillOptions(color, tool === 'marker' ? markerLabels : penLabels, activeShades[tool]);
    }
    query('#cn-boardhint').textContent = firstCard ? '次に、もう1枚のカードを選んでください。' : hints[tool];
    for (const grip of cards.querySelectorAll('.cn-grip')) {
      if (tool === 'connect') {
        grip.firstChild.hidden = false;
        grip.firstChild.textContent = 'このカードを選ぶ';
        grip.setAttribute('aria-label', 'つなぐカードを選択: ' + grip.dataset.caption);
        grip.setAttribute('aria-pressed', String(grip.closest('.cn-scrap').dataset.id === firstCard));
      } else {
        const pinned = isCardPinned(grip.closest('.cn-scrap').dataset.id);
        grip.firstChild.hidden = true;
        grip.firstChild.textContent = '';
        grip.setAttribute('aria-label', (pinned ? '固定中のカードのサイズ調整: ' : 'カードのサイズ調整と移動: ') + grip.dataset.caption);
        grip.removeAttribute('aria-pressed');
      }
    }
  }

  function setTool(next) {
    tool = next;
    firstCard = null;
    selectedInk = null;
    clearBoardSelection();
    updateTool();
    paint();
  }

  color.onchange = () => { activeShades[tool] = Number(color.value); };

  function connect(id) {
    if (!firstCard || firstCard === id) {
      firstCard = firstCard === id ? null : id;
      updateTool();
      return;
    }
    const note = current();
    const exists = note.edges.findIndex(pair => pair.includes(firstCard) && pair.includes(id));
    backup();
    if (exists >= 0) note.edges.splice(exists,1);
    else note.edges.push([firstCard,id]);
    firstCard = null;
    updateTool();
    paint();
    status(exists >= 0 ? 'カードをつなぐ線を外しました。' : 'カードを線でつなぎました。');
    persist();
  }

  function renderCards() {
    const note = current();
    cards.replaceChildren();
    if (!note.cards.length) {
      cards.append(element('div', 'cn-empty', '「書く」で項目をちぎると、ここにカードが並びます。'));
    }
    for (const card of note.cards) {
      const paper = element('article', 'cn-scrap');
      paper.dataset.id = card.id;
      applyCardDimensions(card,paper);
      paper.addEventListener('pointerdown',()=>touchBoardItem(card));
      paper.addEventListener('focusin',()=>touchBoardItem(card));
      const original = note.notes.find(item => item.id === card.source);
      const done = Boolean(card.linked ? original?.done : card.done);
      paper.toggleAttribute('data-done',done);
      const paperInk = element('canvas','cn-paper-ink');
      paperInk.setAttribute('aria-hidden','true');
      const grip = element('button', 'cn-grip');
      grip.type = 'button';
      grip.dataset.caption = card.text || '内容なし';
      grip.append(element('span'),
        element('span', '', done ? '完了' : card.linked ? '連動中' : '独立メモ'));
      grip.onclick = event => {
        const wasDragged = grip.hasAttribute('data-dragged');
        grip.removeAttribute('data-dragged');
        if (tool === 'connect') connect(card.id);
        else if (tool === 'move' && (!wasDragged || event.detail === 0)) selectCard(card.id);
      };
      attachMove(grip, paper, card);
      const writingArea = element('div','cn-paper-body');
      const text = element('textarea');
      text.value = card.text;
      text.rows = 1;
      text.maxLength = 80;
      text.placeholder = 'ここに書く';
      text.setAttribute('aria-label', 'カードの内容');
      if (card.linked) text.dataset.source = card.source;
      recordEditing(text, value => {
        card.text = value;
        fitPaperText(text);
        if (card.linked) updateText(card.source, value, text);
      });
      writingArea.append(text);
      const actions = element('div', 'cn-cardtools');
      const paperPicker = element('label','cn-palette');
      const paperColor = element('select');
      paperColor.setAttribute('aria-label','カードの紙色');
      fillOptions(paperColor,paperColors.map(([name]) => name),card.paper);
      const applyPaperColor = () => {
        const swatch = paperColors[card.paper ?? 0][1];
        paperColor.style.setProperty('--cn-swatch',swatch);
        paper.style.setProperty('--cn-card-color',swatch);
      };
      paperColor.onchange = () => {
        backup();
        card.paper = Number(paperColor.value);
        applyPaperColor();
        persist();
      };
      paperPicker.append(element('span','','色'),paperColor);
      applyPaperColor();
      const label = element('label');
      const toggle = element('input');
      toggle.type = 'checkbox';
      toggle.checked = card.linked;
      label.append(toggle, document.createTextNode('連動'));
      toggle.onchange = () => {
        backup();
        card.linked = toggle.checked;
        if (card.linked) card.text = original.text;
        else card.done = Boolean(original.done);
        renderRows();
        renderCards();
        cards.querySelector('[data-id="' + card.id + '"] input').focus();
        status(card.linked ? '元のメモの内容で連動を再開しました。' : 'このカードだけ編集できます。');
        persist();
      };
      const source = element('button', '', '元のメモ');
      source.type = 'button';
      source.onclick = () => {
        setMode('list');
        rows.querySelector('[data-source="' + card.source + '"]')?.focus();
        status('カードの元のメモを開きました。');
        persist();
      };
      const remove = element('button', '', '外す');
      remove.type = 'button';
      remove.onclick = () => {
        backup();
        (note.decorations || []).filter(piece=>piece.pin?.card===card.id).forEach(detachTape);
        note.cards = note.cards.filter(entry => entry.id !== card.id);
        note.edges = note.edges.filter(pair => !pair.includes(card.id));
        note.strokes = note.strokes.filter(mark => mark.card !== card.id);
        if (firstCard === card.id) firstCard = null;
        renderRows();
        renderCards();
        renderDecorations();
        query('#cn-undo').focus();
        status('カードをボードから外しました。');
        persist();
      };
      if (original) actions.append(label);
      actions.append(paperPicker);
      if (original) actions.append(source);
      actions.append(remove);
      paper.append(grip, writingArea, actions, paperInk);
      cards.append(paper);
    }
    updateTool();
    updateInspectors();
    layout();
  }

  const paperTextFit = new WeakMap();
  function fitPaperText(field) {
    const body = field.parentElement;
    if (!body?.clientWidth) return;
    const key = body.clientWidth+'|'+body.clientHeight+'|'+field.value;
    if (paperTextFit.get(field)===key) return;
    paperTextFit.set(field,key);
    const oneLine = Math.ceil(parseFloat(getComputedStyle(field).lineHeight) || 27);
    field.style.height = oneLine+'px';
    field.style.height = Math.min(body.clientHeight,Math.max(oneLine,field.scrollHeight))+'px';
  }

  function attachMove(grip, paper, card) {
    paper.onpointerdown = event => {
      if (tool !== 'move' || event.button !== 0 || drag) return;
      const onGrip = grip.contains(event.target);
      if (!onGrip && event.target.closest('button,textarea,input,select,label,a')) return;
      grip.removeAttribute('data-dragged');
      const locked = isCardPinned(card.id);
      if (onGrip && locked) {
        status('テープで固定中です。動かすにはテープの固定を解除してください。');
        return;
      }
      if (!onGrip) {
        event.preventDefault();
        const active = document.activeElement;
        if (root.contains(active) && active.matches('textarea,input[type=text]')) active.blur();
      }
      drag = {paper,onGrip,locked,id:event.pointerId,startX:event.clientX,startY:event.clientY,x:card.x,y:card.y,moved:false};
      (onGrip ? grip : paper).setPointerCapture(event.pointerId);
    };
    paper.onpointermove = event => {
      if (drag?.id !== event.pointerId || drag.paper!==paper) return;
      const dx = event.clientX - drag.startX;
      const dy = event.clientY - drag.startY;
      if (!drag.moved && Math.hypot(dx,dy) < 3) return;
      if (drag.locked) {
        if (!drag.moved) status('テープで固定中です。動かすにはテープの固定を解除してください。');
        drag.moved = true;
        return;
      }
      if (!drag.moved) backup();
      drag.moved = true;
      paper.setAttribute('data-moving','');
      const range = Math.max(1,board.clientWidth - (paperPoses.get(paper)?.w ?? paper.offsetWidth));
      card.x = clamp(drag.x + dx / range,0,1);
      card.y = clamp(drag.y + dy,0,3900);
      layout();
    };
    const end = event => {
      if (drag?.id !== event.pointerId || drag.paper!==paper) return;
      const {moved,onGrip,locked} = drag;
      drag = null;
      paper.removeAttribute('data-moving');
      if (moved && !locked) {
        if (onGrip) grip.setAttribute('data-dragged','');
        persist();
      }
      if (!onGrip && event.type==='pointerup') selectCard(card.id);
    };
    paper.onpointerup = end;
    paper.onpointercancel = end;
    paper.onlostpointercapture = end;
    grip.onkeydown = event => {
      const offset = {ArrowLeft:[-20,0],ArrowRight:[20,0],ArrowUp:[0,-20],ArrowDown:[0,20]}[event.key];
      if (!offset || tool !== 'move') return;
      event.preventDefault();
      if (isCardPinned(card.id)) {
        status('テープで固定中です。動かすにはテープの固定を解除してください。');
        return;
      }
      backup();
      setTopLayer(card);
      const range = Math.max(1,board.clientWidth - (paperPoses.get(paper)?.w ?? paper.offsetWidth));
      card.x = clamp(card.x + offset[0] / range,0,1);
      card.y = clamp(card.y + offset[1],0,3900);
      layout();
      persist();
    };
  }

  function layout() {
    const width = board.clientWidth;
    if (!width) return;
    let height = 430;
    const byId = new Map(current().cards.map(card => [card.id,card]));
    for (const paper of cards.querySelectorAll('.cn-scrap')) {
      const card = byId.get(paper.dataset.id);
      fitPaperText(paper.querySelector('textarea'));
      const pose = paperPose(paper,card,width);
      paperPoses.set(paper,pose);
      paper.style.zIndex = boardObjectLayer(card);
      paper.style.left = pose.x+'px';
      paper.style.top = pose.y+'px';
      paper.style.setProperty('--cn-paper-scale',pose.scale);
      paper.style.setProperty('--cn-paper-angle',pose.angle+'deg');
      height = Math.max(height,pose.y+pose.radiusY+24);
    }
    height = Math.max(height,layoutDecorations(width),layoutTransform(width));
    for (const {path, card, dy = 0} of current().strokes) {
      if (card) continue;
      for (let index = 2; index < path.length; index += 5) {
        height = Math.max(height,parseInt(path.slice(index,index+3),36) + dy + 16);
      }
    }
    board.style.height = height + 2 + 'px';
    paint();
  }

  function fitCanvas(canvas) {
    const scale = Math.min(devicePixelRatio || 1,2);
    const width = canvas.clientWidth;
    const height = canvas.clientHeight;
    const w = Math.round(width * scale);
    const h = Math.round(height * scale);
    if (canvas.width !== w) canvas.width = w;
    if (canvas.height !== h) canvas.height = h;
    const context = canvas.getContext('2d');
    context.setTransform(scale,0,0,scale,0,0);
    context.clearRect(0,0,width,height);
    context.lineJoin = 'round';
    context.lineCap = 'round';
    return context;
  }

  function decode(mark, width = board.clientWidth) {
    const points = [];
    const {path, card, dx = 0, dy = 0} = mark;
    for (let index = 0; index < path.length; index += 5) {
      const x = parseInt(path.slice(index,index+2),36);
      const y = parseInt(path.slice(index+2,index+5),36);
      points.push(card ? [(x-300)*width/600,y-300] : [(x+dx)*width/1000,y+dy]);
    }
    return points;
  }

  function drawMark(context, mark, width, dark, heightScale = 1) {
    const points = decode(mark,width);
    if (!points.length) return;
    const palette = mark.marker ? markerColors : colors;
    context.strokeStyle = (palette[mark.color] || palette[0])[dark ? 1 : 0];
    context.lineWidth = mark.marker ? 17 : 2.8;
    context.globalAlpha = mark.marker ? .44 : 1;
    context.beginPath();
    context.moveTo(points[0][0],points[0][1]*heightScale);
    for (const [x,y] of points.slice(1)) context.lineTo(x,y*heightScale);
    if (points.length === 1) context.lineTo(points[0][0] + .1,points[0][1]*heightScale);
    context.stroke();
    context.globalAlpha = 1;
  }

  function markBounds(mark) {
    const points = decode(mark);
    const x = points.map(point => point[0]);
    const y = points.map(point => point[1]);
    return [Math.min(...x),Math.min(...y),Math.max(...x),Math.max(...y)];
  }

  function paint() {
    if (!board.clientWidth) return;
    const geometry = new Map([...cards.querySelectorAll('.cn-scrap')].map(paper => [paper.dataset.id,paper]));
    const dark = getComputedStyle(root).colorScheme === 'dark' || matchMedia('(prefers-color-scheme: dark)').matches;
    const wireContext = fitCanvas(wires);
    for (const [from,to] of current().edges) {
      const a = geometry.get(from);
      const b = geometry.get(to);
      if (!paperPoses.has(a) || !paperPoses.has(b)) continue;
      const {x:x1,y:y1} = paperPoses.get(a);
      const {x:x2,y:y2} = paperPoses.get(b);
      wireContext.beginPath();
      wireContext.moveTo(x1,y1);
      wireContext.bezierCurveTo(x1,(y1+y2)/2,x2,(y1+y2)/2,x2,y2);
      wireContext.strokeStyle = dark ? '#8ebeaa' : '#507e68';
      wireContext.lineWidth = 2.6;
      wireContext.stroke();
    }
    const layers = new Map();
    const paperCards = new Map(current().cards.map(card=>[card.id,card]));
    for (const [id,paper] of geometry) {
      const layer = paper.querySelector('.cn-paper-ink');
      layers.set(id,[fitCanvas(layer),layer.clientWidth,cardInkScale(layer,paperCards.get(id))]);
    }
    const inkContext = fitCanvas(ink);
    const marks = stroke?.mark.path ? [...current().strokes,stroke.mark] : current().strokes;
    paintFreeMarks(dark);
    for (const mark of marks) {
      if (!mark.card && mark===stroke?.mark) {
        drawMark(inkContext,mark,board.clientWidth,dark);
      } else if (layers.has(mark.card)) {
        const [context,width,heightScale] = layers.get(mark.card);
        drawMark(context,mark,width,dark,heightScale);
      }
    }
    const selected = marks.find(mark => mark.id === selectedInk);
    if (selected) {
      const [left,top,right,bottom] = markBounds(selected);
      inkContext.save();
      inkContext.strokeStyle = dark ? '#c5ead6' : '#236349';
      inkContext.lineWidth = 1.4;
      inkContext.setLineDash([5,4]);
      inkContext.strokeRect(left-10,top-10,right-left+20,bottom-top+20);
      inkContext.restore();
    }
  }

  function nearMark(point, mark, width) {
    const points = decode(mark,width);
    return points.some((end,index) => {
      const start = points[index-1] || end;
      const [dx,dy] = [end[0]-start[0],end[1]-start[1]];
      const length = dx*dx + dy*dy;
      const t = length ? clamp(((point[0]-start[0])*dx + (point[1]-start[1])*dy)/length,0,1) : 0;
      return Math.hypot(point[0]-start[0]-dx*t,point[1]-start[1]-dy*t) < (mark.marker ? 19 : 12);
    });
  }

  function cardAt(x,y) {
    return document.elementsFromPoint(x,y).find(element => element.classList.contains('cn-scrap'));
  }

  function canvasPosition(layer,x,y) {
    const pose = paperPoses.get(layer.parentElement);
    if (pose) {
      const bounds = ink.getBoundingClientRect();
      const local = turnPoint(x-bounds.left-pose.x,y-bounds.top-pose.y,-pose.angle);
      return [local[0]/pose.scale+layer.clientWidth/2,local[1]/pose.scale+layer.clientHeight/2];
    }
    const bounds = layer.getBoundingClientRect();
    return [(x-bounds.left)*layer.clientWidth/bounds.width,
      (y-bounds.top)*layer.clientHeight/bounds.height];
  }

  function eraseAt(x,y) {
    const note = current();
    const ordered = [...note.strokes].sort((a,b)=>boardObjectLayer(b)-boardObjectLayer(a));
    const boardPoint = canvasPosition(ink,x,y);
    let hit = ordered.find(mark => !mark.card && nearMark(boardPoint,mark));
    if (!hit) {
      const paper = cardAt(x,y);
      if (paper) {
        const layer = paper.querySelector('.cn-paper-ink');
        const card = note.cards.find(item=>item.id===paper.dataset.id);
        const [paperX,paperY] = canvasPosition(layer,x,y);
        const local = [paperX,paperY/cardInkScale(layer,card)];
        hit = ordered.find(mark => mark.card === paper.dataset.id && nearMark(local,mark,layer.clientWidth));
      }
    }
    if (hit) {
      if (!stroke.changed) backup();
      stroke.changed = true;
      note.strokes = note.strokes.filter(mark => mark !== hit);
    }
  }

  function sampleStroke(event) {
    const point = [event.clientX,event.clientY];
    const last = stroke.last || point;
    const distance = Math.hypot(point[0]-last[0],point[1]-last[1]);
    if (stroke.kind === 'erase') {
      const steps = Math.max(1,Math.ceil(distance/10));
      for (let i = 1; i <= steps; i++) {
        eraseAt(last[0]+(point[0]-last[0])*i/steps,last[1]+(point[1]-last[1])*i/steps);
      }
      stroke.last = point;
    } else if ((!stroke.last || distance >= 2) && stroke.mark.path.length < 3000) {
      const [localX,y] = canvasPosition(stroke.layer,...point);
      const x = localX/stroke.layer.clientWidth;
      const onCard = Boolean(stroke.mark.card);
      const encodedX = onCard ? clamp(x*600+300,0,1295) : clamp(x,0,1)*1000;
      const card = onCard ? current().cards.find(card=>card.id===stroke.mark.card) : null;
      const encodedY = onCard ? clamp(y/cardInkScale(stroke.layer,card)+300,0,1800) :
        clamp(y,0,Math.min(stroke.layer.clientHeight-1,4200));
      stroke.mark.path += Math.round(encodedX).toString(36).padStart(2,'0') +
        Math.round(encodedY).toString(36).padStart(3,'0');
      stroke.last = point;
    }
    paint();
  }

  function beginInkMove(event) {
    const bounds = ink.getBoundingClientRect();
    const point = [event.clientX-bounds.left,event.clientY-bounds.top];
    const free = current().strokes.filter(mark => !mark.card);
    let hit = free.sort((a,b)=>boardObjectLayer(b)-boardObjectLayer(a)).find(mark => nearMark(point,mark));
    const previous = free.find(mark => mark.id === selectedInk);
    if (!hit && previous) {
      const [left,top,right,bottom] = markBounds(previous);
      if (point[0] >= left-10 && point[0] <= right+10 && point[1] >= top-10 && point[1] <= bottom+10) hit = previous;
    }
    selectedInk = hit?.id || null;
    if (hit) {
      touchBoardItem(hit);
      inkDrag = {id:event.pointerId, mark:hit, startX:event.clientX, startY:event.clientY,
        dx:hit.dx || 0,dy:hit.dy || 0,bounds:markBounds(hit),moved:false};
      ink.setPointerCapture(event.pointerId);
    }
    paint();
  }

  function moveInk(event) {
    const dx = event.clientX-inkDrag.startX;
    const dy = event.clientY-inkDrag.startY;
    if (!inkDrag.moved && Math.hypot(dx,dy) < 3) return;
    if (!inkDrag.moved) backup();
    inkDrag.moved = true;
    ink.dataset.dragging = '';
    const [left,top,right,bottom] = inkDrag.bounds;
    const width = board.clientWidth;
    inkDrag.mark.dx = inkDrag.dx + Math.round(clamp(dx,-left,width-right)*1000/width);
    inkDrag.mark.dy = inkDrag.dy + Math.round(clamp(dy,-top,4200-bottom));
    layout();
  }

  ink.onpointerdown = event => {
    if (event.button !== 0 || stroke || inkDrag) return;
    if (tool === 'select') {
      beginInkMove(event);
      return;
    }
    if (!['pen','marker','erase'].includes(tool)) return;
    const paper = tool === 'erase' ? null : cardAt(event.clientX,event.clientY);
    const mark = {id:uid(),color:Number(color.value),path:''};
    if (tool === 'marker') mark.marker = true;
    if (paper) {
      mark.card = paper.dataset.id;
      const card = current().cards.find(item=>item.id===mark.card);
      if (card) touchBoardItem(card);
    }
    stroke = {id:event.pointerId,kind:tool,mark,layer:paper?.querySelector('.cn-paper-ink') || ink,last:null,changed:false};
    ink.setPointerCapture(event.pointerId);
    sampleStroke(event);
  };

  ink.onpointermove = event => {
    if (stroke?.id === event.pointerId) sampleStroke(event);
    if (inkDrag?.id === event.pointerId) moveInk(event);
  };

  function finishInk(event) {
    if (inkDrag?.id === event.pointerId) {
      if (inkDrag.moved) persist();
      inkDrag = null;
      delete ink.dataset.dragging;
    }
    if (stroke?.id !== event.pointerId) return;
    const {mark,changed} = stroke;
    stroke = null;
    if (mark.path && event.type !== 'pointercancel') {
      backup();
      current().strokes.push(mark);
      if (!mark.card) setTopLayer(mark);
      persist();
    } else if (changed) {
      persist();
    }
    layout();
  }
  ink.onpointerup = finishInk;
  ink.onpointercancel = finishInk;
  ink.onlostpointercapture = finishInk;

  function placeCard(note,item) {
    const space = query('.cn-editor').clientWidth - 44;
    const width = Math.min(236,space-20);
    const padding = window.matchMedia('(pointer: coarse)').matches ? 86 : 28;
    const gap = 190 + padding;
    const columns = space >= 490 ? [.04,.96,.5] : [.15];
    const occupied = note.cards.map(card => {
      const [wantedWidth,wantedHeight] = cardDimensions(card);
      const actualWidth = Math.min(wantedWidth,space-20);
      return {left:card.x*(space-actualWidth),width:actualWidth,top:card.y,height:wantedHeight+padding};
    });
    let desired;
    for (let y = 24; !desired && y < 4100; y += gap) {
      for (const x of columns) {
        const left = x*(space-width);
        if (occupied.every(area=>left+width+8<=area.left || left>=area.left+area.width+8 ||
            y+gap<=area.top || y>=area.top+area.height)) {
          desired = {x,y};
          break;
        }
      }
    }
    const card = {id:uid(),source:item.id,linked:note.link,text:item.text,...(desired || {x:.5,y:3900})};
    if (item.done && !note.link) card.done = true;
    note.cards.push(card);
    setTopLayer(card);
  }

  query('#cn-tear').onclick = () => {
    const note = current();
    const picked = tearableItems(note);
    if (!picked.length) return;
    if (note.cards.length + picked.length > 20) {
      status('1つのボードに置けるカードは20枚までです。');
      return;
    }
    backup();
    for (const item of picked) placeCard(note,item);
    const pickedIds = new Set(picked.map(item => item.id));
    note.selected = note.selected.filter(id => !pickedIds.has(id));
    setTool('move');
    renderRows();
    renderCards();
    setMode('board');
    query('#cn-board-tab').focus();
    status(picked.length + '件をボードに置きました。');
    persist();
  };
  query('#cn-link').onchange = event => {
    current().link = event.target.checked;
    persist();
  };
  query('#cn-add').onclick = () => add();
  function changeMode(mode) {
    setMode(mode);
    if (mode === 'list') setTool('move');
    status('');
    persist();
  }
  query('#cn-list-tab').onclick = () => changeMode('list');
  query('#cn-board-tab').onclick = () => changeMode('board');
  query('.cn-modes').onkeydown = event => {
    if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
    event.preventDefault();
    const next = current().mode === 'list' ? 'board' : 'list';
    changeMode(next);
    query('#cn-' + next + '-tab').focus();
  };
  for (const button of toolButtons) button.onclick = () => {
    status('');
    setTool(button.dataset.tool);
  };
  query('#cn-undo').onclick = () => {
    const id = workspace.active;
    if (!undo.has(id)) return;
    const currentMode = current().mode;
    workspace.notebooks[workspace.notebooks.findIndex(note => note.id === id)] = undo.get(id);
    current().mode = currentMode;
    undo.delete(id);
    firstCard = null;
    selectedInk = null;
    render();
    status('ひとつ前の操作を元に戻しました。');
    persist();
  };

  function render() {
    title.value = current().title;
    query('#cn-link').checked = current().link;
    query('#cn-undo').disabled = !undo.has(current().id);
    renderLibrary();
    renderLibraryVisibility();
    renderRows();
    renderCards();
    renderDecorations();
    applyBackground();
    applyTexture();
    setMode(current().mode);
  }

  const vectorAssets = window.chigiriAssetCatalog;
  const assetsById = new Map(vectorAssets.map(asset => [asset.id, asset]));

  const assetPicker = query('#cn-asset-picker');
  const assetGrid = query('#cn-asset-grid');
  const pickerToggle = query('#cn-decor-toggle');
  const decorLayer = query('#cn-decorations');
  const markLayer = query('#cn-ink-objects');
  const markCanvases = new Map();
  const sizeInspector = query('#cn-size-inspector');
  const decorInspector = query('#cn-decor-inspector');
  const cardWidth = query('#cn-card-width');
  const cardHeight = query('#cn-card-height');
  const cardShape = query('#cn-card-shape');
  const decorSize = query('#cn-decor-size');
  const decorAngle = query('#cn-decor-angle');
  const pinTarget = query('#cn-pin-target');
  const pinAttach = query('#cn-pin-attach');
  const unpin = query('#cn-unpin');
  const defaultCardSize = [236,190];
  const cardPresets = {standard:defaultCardSize, portrait:[194,296], landscape:[350,169]};
  const tapeAssets = new Set(['10-navy-gingham-tape','26-polka-dot-tape',
    ...vectorAssets.filter(asset=>asset.role==='tape').map(asset=>asset.id)]);
  const motifAssets = new Set([
    '07-botanical-wax-seal','11-moon-phase-medallion','12-brass-paper-clip','14-navy-bow',
    '16-monogram-wax-seal','19-blue-butterfly-side','20-lace-doily','21-skeleton-leaves',
    '24-brass-number-tag','25-blue-butterfly'
  ]);
  const assetsPerPage = 8;
  let activeCollection = 'tape';
  let activeSeries = 'all';
  let activeAssetPage = 0;
  let selectedCardId;
  let selectedDecorId;

  function selectedCard() {
    return current().cards.find(card=>card.id===selectedCardId);
  }

  function selectedDecoration() {
    return (current().decorations || []).find(piece=>piece.id===selectedDecorId);
  }

  function assetCollection(asset) {
    if (asset.role) return asset.role;
    if (tapeAssets.has(asset.id)) return 'tape';
    if (asset.category===1) return 'wash';
    return motifAssets.has(asset.id) ? 'motif' : 'paper';
  }

  function isCardPinned(id) {
    return (current().decorations || []).some(piece=>piece.pin?.card===id && tapeAssets.has(piece.asset));
  }

  function cardPaper(id) {
    return [...cards.children].find(node=>node.dataset.id===id);
  }

  function boardObjectLayer(item) {
    if (Number.isInteger(item.layer)) return item.layer;
    const note = current();
    const cardIndex = note.cards.indexOf(item);
    if (cardIndex>=0) return 2+cardIndex*2;
    const decorIndex = (note.decorations || []).indexOf(item);
    if (decorIndex>=0) return 52+decorIndex*2;
    return 128+Math.max(0,note.strokes.indexOf(item))*2;
  }

  function topBoardLayer() {
    const note = current();
    const objects = [...note.cards,...(note.decorations || []).filter(piece=>!piece.pin),
      ...note.strokes.filter(mark=>!mark.card)];
    return Math.max(0,...objects.map(boardObjectLayer));
  }

  function setTopLayer(item) {
    const top = topBoardLayer();
    if (boardObjectLayer(item)>=top) return false;
    item.layer = top+2;
    return true;
  }

  function touchBoardItem(item) {
    if (tapeAssets.has(item.asset) || !setTopLayer(item)) return;
    layout();
    persist(true);
  }

  function paintFreeMarks(dark) {
    const free = current().strokes.filter(mark=>!mark.card);
    const alive = new Set(free.map(mark=>mark.id));
    for (const [id,entry] of markCanvases) {
      if (!alive.has(id)) {
        entry.canvas.remove();
        markCanvases.delete(id);
      }
    }
    for (const mark of free) {
      let entry = markCanvases.get(mark.id);
      if (!entry) {
        const canvas = element('canvas','cn-free-mark');
        canvas.dataset.id = mark.id;
        markLayer.append(canvas);
        entry = {canvas,key:''};
        markCanvases.set(mark.id,entry);
      }
      const {canvas} = entry;
      canvas.style.zIndex = boardObjectLayer(mark);
      const [left,top,right,bottom] = markBounds(mark);
      const pad = mark.marker ? 10 : 3;
      const x = Math.floor(left-pad);
      const y = Math.floor(top-pad);
      const width = Math.ceil(right+pad)-x;
      const height = Math.ceil(bottom+pad)-y;
      const key = [board.clientWidth,x,y,width,height,dark,devicePixelRatio,mark.dx,mark.dy,mark.color,Boolean(mark.marker),mark.path].join('|');
      if (key===entry.key) continue;
      entry.key = key;
      canvas.style.left = x+'px';
      canvas.style.top = y+'px';
      canvas.style.width = width+'px';
      canvas.style.height = height+'px';
      const context = fitCanvas(canvas);
      context.translate(-x,-y);
      drawMark(context,mark,board.clientWidth,dark);
    }
  }

  function cardDimensions(card) {
    return [card.width ?? defaultCardSize[0],card.height ?? defaultCardSize[1]];
  }

  function writingSpace(card) {
    return Math.max(38,68+cardDimensions(card)[1]-defaultCardSize[1]);
  }

  function applyCardDimensions(card,node) {
    node.style.setProperty('--cn-card-width',cardDimensions(card)[0]+'px');
    node.style.setProperty('--cn-writing-space',writingSpace(card)+'px');
  }

  function cardInkScale(layer,card) {
    if (!card) return 1;
    const height = layer.clientHeight;
    return height/Math.max(1,height+68-writingSpace(card));
  }

  function updateInspectors() {
    const card = tool==='move' ? selectedCard() : null;
    const decoration = tool==='move' ? selectedDecoration() : null;
    sizeInspector.hidden = !card;
    decorInspector.hidden = !decoration;
    if (tool==='move') {
      query('#cn-boardhint').textContent = card || decoration ?
        '四隅でサイズ変更。枠から伸びた丸いハンドルで回転。' : hints.move;
    }
    for (const paper of cards.querySelectorAll('.cn-scrap')) {
      const selected = paper.dataset.id===card?.id;
      paper.toggleAttribute('data-editing-size',selected);
      paper.toggleAttribute('data-pinned',isCardPinned(paper.dataset.id));
      const grip = paper.querySelector('.cn-grip');
      if (tool==='move') {
        grip.setAttribute('aria-controls','cn-size-inspector');
        grip.setAttribute('aria-expanded',String(selected));
      } else {
        grip.removeAttribute('aria-controls');
        grip.removeAttribute('aria-expanded');
      }
    }
    const pieces = new Map((current().decorations || []).map(piece=>[piece.id,piece]));
    for (const node of decorLayer.children) {
      node.setAttribute('aria-pressed',String(node.dataset.id===decoration?.id));
      node.toggleAttribute('data-attached',Boolean(pieces.get(node.dataset.id)?.pin));
    }
    if (card) {
      const [width,height] = cardDimensions(card);
      cardWidth.value = width;
      cardHeight.value = height;
      cardAngle.value = card.angle || 0;
      query('#cn-card-angle-value').textContent = (card.angle || 0)+'°';
      cardShape.value = Object.keys(cardPresets).find(key=>cardPresets[key][0]===width && cardPresets[key][1]===height) || 'custom';
      query('#cn-card-width-value').textContent = Math.round(width/defaultCardSize[0]*100)+'%';
      query('#cn-card-height-value').textContent = Math.round(height/defaultCardSize[1]*100)+'%';
    }
    if (decoration) {
      const isTape = tapeAssets.has(decoration.asset);
      query('#cn-decor-name').textContent = assetsById.get(decoration.asset).name+(decoration.pin ? ' · 固定中' : '');
      query('#cn-pin-actions').hidden = !isTape || Boolean(decoration.pin) || !current().cards.length;
      unpin.hidden = !decoration.pin;
      if (isTape && !decoration.pin) {
        const saved = pinTarget.value;
        pinTarget.replaceChildren(new Option('固定先を選ぶ',''),...current().cards.map((card,index)=>
          new Option(card.text.trim().slice(0,32) || 'カード '+(index+1),card.id)));
        pinTarget.value = current().cards.some(card=>card.id===saved) ? saved : '';
        pinAttach.disabled = !pinTarget.value;
      }
      decorSize.value = decoration.size;
      decorAngle.value = pinnedPosition(decoration,board.clientWidth || 1).angle;
      query('#cn-decor-size-value').textContent = decoration.size;
      query('#cn-decor-angle-value').textContent = decorAngle.value+'°';
    }
  }

  function selectCard(id) {
    selectedCardId = id;
    selectedDecorId = undefined;
    updateInspectors();
    layout();
  }

  function selectDecoration(id) {
    if (selectedDecorId!==id) pinTarget.value = '';
    selectedDecorId = id;
    selectedCardId = undefined;
    updateInspectors();
    layout();
  }

  function closePicker(open = false) {
    assetPicker.hidden = !open;
    pickerToggle.setAttribute('aria-expanded',String(open));
    if (open) renderAssetPicker();
  }

  function clearBoardSelection() {
    selectedCardId = selectedDecorId = undefined;
    closePicker();
    updateInspectors();
    transformBox.hidden = true;
  }

  function putCardSize(width,height) {
    const card = selectedCard();
    if (!card) return;
    setTopLayer(card);
    card.width = width;
    card.height = height;
    const paper = [...cards.children].find(node=>node.dataset.id===card.id);
    if (paper) applyCardDimensions(card,paper);
    updateInspectors();
    layout();
  }

  function bindRange(input,apply) {
    let started = false;
    input.addEventListener('input',()=>{
      if (!started) backup();
      started = true;
      apply(Number(input.value));
      persist(true);
    });
    const finish = ()=>{
      if (!started) return;
      started = false;
      persist();
    };
    input.addEventListener('change',finish);
    input.addEventListener('blur',finish);
  }

  cardShape.onchange = () => {
    const preset = cardPresets[cardShape.value];
    if (!selectedCard() || !preset) return;
    backup();
    putCardSize(...preset);
    persist();
  };
  bindRange(cardWidth,width=>{
    const card = selectedCard();
    if (card) putCardSize(width,cardDimensions(card)[1]);
  });
  bindRange(cardHeight,height=>{
    const card = selectedCard();
    if (card) putCardSize(cardDimensions(card)[0],height);
  });
  query('#cn-size-close').onclick = ()=>{
    const paper = [...cards.children].find(node=>node.dataset.id===selectedCardId);
    selectCard();
    paper?.querySelector('.cn-grip').focus();
  };

  function renderAssetPicker() {
    const inSeries = activeSeries==='all' ? vectorAssets : vectorAssets.filter(asset=>asset.series===activeSeries);
    const roles = new Set(inSeries.map(assetCollection));
    if (!roles.has(activeCollection)) {
      activeCollection = ['paper','motif','wash','tape'].find(role=>roles.has(role));
      activeAssetPage = 0;
    }
    const available = inSeries.filter(asset=>assetCollection(asset)===activeCollection);
    const pages = Math.ceil(available.length/assetsPerPage);
    activeAssetPage = clamp(activeAssetPage,0,pages-1);
    const start = activeAssetPage*assetsPerPage;
    query('#cn-assets-page').textContent = (activeAssetPage+1)+' / '+pages;
    query('#cn-picker-pages').hidden = pages<2;
    query('#cn-assets-prev').disabled = activeAssetPage===0;
    query('#cn-assets-next').disabled = activeAssetPage>=pages-1;
    const visible = available.slice(start,start+assetsPerPage);
    const credits = [];
    if (visible.some(asset=>asset.series==='existing' && activeCollection==='wash')) credits.push('AqwaColor');
    if (visible.some(asset=>asset.series==='pretty')) credits.push('Printable Pretty Studio');
    const credit = query('#cn-assets-credit');
    credit.hidden = !credits.length;
    credit.textContent = credits.length ? '元画像の表記：'+credits.join(' / ') : '';
    query('#cn-tape-hint').hidden = activeCollection!=='tape';
    for (const button of root.querySelectorAll('[data-collection]')) {
      button.setAttribute('aria-pressed',String(button.dataset.collection===activeCollection));
      button.disabled = !roles.has(button.dataset.collection);
    }
    assetGrid.replaceChildren();
    for (const asset of visible) {
      const tile = element('button','cn-decor-option');
      tile.type = 'button';
      tile.dataset.asset = asset.id;
      tile.setAttribute('aria-label',asset.name+'を貼る');
      const thumbnail = element('img');
      thumbnail.alt = '';
      const caption = element('span','',asset.name);
      tile.append(thumbnail,caption);
      tile.onclick = ()=>addDecoration(asset);
      assetGrid.append(tile);
      thumbnail.src = asset.src;
    }
  }

  pickerToggle.onclick = ()=>closePicker(assetPicker.hidden);
  query('#cn-asset-series').onchange = event=>{
    activeSeries = event.target.value;
    activeAssetPage = 0;
    renderAssetPicker();
  };
  query('#cn-assets-prev').onclick = ()=>{
    activeAssetPage--;
    renderAssetPicker();
  };
  query('#cn-assets-next').onclick = ()=>{
    activeAssetPage++;
    renderAssetPicker();
  };
  for (const button of root.querySelectorAll('[data-collection]')) {
    button.onclick = ()=>{
      activeCollection = button.dataset.collection;
      activeAssetPage = 0;
      renderAssetPicker();
    };
  }

  function decorationBox(piece,width) {
    const asset = assetsById.get(piece.asset);
    const angle = piece.angle*Math.PI/180;
    const horizontal = Math.abs(Math.cos(angle));
    const vertical = Math.abs(Math.sin(angle));
    const gripRoom = coarsePointer.matches ? 23 : 13;
    const factor = Math.min(piece.size/Math.max(asset.width,asset.height),
      Math.max(24,width-2*gripRoom)/(asset.width*horizontal+asset.height*vertical));
    const w = asset.width*factor;
    const h = asset.height*factor;
    const xRadius = (w*horizontal+h*vertical)/2;
    const yRadius = (w*vertical+h*horizontal)/2;
    const clearanceX = Math.min(width/2,(Math.max(52,w)*horizontal+Math.max(52,h)*vertical)/2+gripRoom);
    const clearanceY = (Math.max(52,w)*vertical+Math.max(52,h)*horizontal)/2+gripRoom;
    return {w,h,x:clamp(piece.x*width,clearanceX,width-clearanceX),
      y:Math.max(piece.y,clearanceY),radiusX:xRadius,radiusY:yRadius};
  }

  function pinnedPosition(piece,width) {
    const pose = piece.pin && paperPoses.get(cardPaper(piece.pin.card));
    if (!pose) return piece;
    const [x,y] = turnPoint(pose.w*(piece.pin.x-.5),pose.h*(piece.pin.y-.5),pose.angle);
    return {...piece,x:(pose.x+x)/width,y:pose.y+y,angle:normalizedAngle(piece.angle+pose.angle)};
  }

  function layoutDecorations(width) {
    let bottom = 0;
    const pieces = new Map((current().decorations || []).map(piece=>[piece.id,piece]));
    for (const node of decorLayer.children) {
      const piece = pieces.get(node.dataset.id);
      if (!piece) continue;
      const box = decorationPose(piece,width);
      const pinnedCard = piece.pin && current().cards.find(card=>card.id===piece.pin.card);
      node.style.zIndex = pinnedCard ? boardObjectLayer(pinnedCard)+1 : boardObjectLayer(piece);
      node.style.left = box.x+'px';
      node.style.top = box.y+'px';
      node.style.width = box.w+'px';
      node.style.height = box.h+'px';
      node.style.setProperty('--cn-angle',box.angle+'deg');
      bottom = Math.max(bottom,box.y+box.radiusY+20);
    }
    return bottom;
  }

  function setDropTarget(paper) {
    for (const item of cards.querySelectorAll('.cn-scrap')) {
      item.toggleAttribute('data-pin-target',item===paper);
    }
  }

  function findDropTarget(node) {
    const piece = (current().decorations || []).find(item=>item.id===node.dataset.id);
    if (!piece) return;
    const tape = decorationPose(piece,board.clientWidth);
    const samples = [-.4,-.2,0,.2,.4].flatMap(x=>[-.4,-.2,0,.2,.4].map(y=>{
      const [dx,dy] = turnPoint(tape.w*x,tape.h*y,tape.angle);
      return [tape.x+dx,tape.y+dy];
    }));
    const targets = [...cards.querySelectorAll('.cn-scrap')].map((paper,index) => {
      const pose = paperPoses.get(paper);
      const inside = pose ? samples.filter(([x,y])=>{
        const [u,v] = turnPoint(x-pose.x,y-pose.y,-pose.angle);
        return Math.abs(u)<=pose.w/2 && Math.abs(v)<=pose.h/2;
      }).length : 0;
      return {paper,index,overlap:inside/samples.length,z:Number(paper.style.zIndex || 0)};
    }).filter(target=>target.overlap>=.2);
    targets.sort((a,b)=>b.z-a.z || b.overlap-a.overlap || b.index-a.index);
    return targets[0]?.paper;
  }

  function pinTape(piece,paper,at) {
    const card = current().cards.find(item=>item.id===paper.dataset.id);
    if (!card || piece.pin || !tapeAssets.has(piece.asset)) return;
    const width = board.clientWidth;
    const pose = paperPoses.get(paper);
    if (!pose) return;
    if (!isCardPinned(card.id)) card.anchorX = (pose.x-pose.w/2)/width;
    const horizontal = assetsById.get(piece.asset).width>=assetsById.get(piece.asset).height;
    const local = at && turnPoint(at.x-pose.x,at.y-pose.y,-pose.angle);
    piece.pin = {card:card.id,
      x:local ? clamp(local[0]/pose.w+.5,-.4,1.4) : horizontal ? .70 : .97,
      y:local ? clamp(local[1]/pose.h+.5,-.4,1.4) : horizontal ? .025 : .27};
    if (at) piece.angle = normalizedAngle(piece.angle-pose.angle);
    updateTool();
    updateInspectors();
    layout();
    status('テープでカードをこの位置に固定しました。');
  }

  function detachTape(piece) {
    const card = current().cards.find(item=>item.id===piece.pin?.card);
    const width = board.clientWidth;
    const position = decorationPose(piece,width);
    piece.x = position.x/width;
    piece.y = position.y;
    piece.angle = position.angle;
    delete piece.pin;
    if (card && !isCardPinned(card.id)) {
      const pose = paperPoses.get(cardPaper(card.id));
      if (pose) putPaperAt(card,pose,pose.x,pose.y);
      delete card.anchorX;
    }
  }

  pinTarget.onchange = ()=>{ pinAttach.disabled = !pinTarget.value; };
  pinAttach.onclick = ()=>{
    const piece = selectedDecoration();
    const paper = cardPaper(pinTarget.value);
    if (!piece || !paper) return;
    backup();
    pinTape(piece,paper);
    unpin.focus({preventScroll:true});
    persist();
  };
  unpin.onclick = ()=>{
    const piece = selectedDecoration();
    if (!piece?.pin) return;
    backup();
    detachTape(piece);
    updateTool();
    updateInspectors();
    layout();
    decorLayer.querySelector('[data-id="'+piece.id+'"]')?.focus({preventScroll:true});
    status('テープの固定を解除しました。');
    persist();
  };

  function addDecoration(asset) {
    const note = current();
    note.decorations ??= [];
    if (note.decorations.length>=32) {
      status('1つのボードに置ける素材は32点までです。');
      return;
    }
    backup();
    const width = board.clientWidth;
    const isTape = tapeAssets.has(asset.id);
    const piece = {id:uid(),asset:asset.id,size:isTape ? 96 : 112,angle:0,x:.5,y:90,layer:topBoardLayer()+2};
    const occupied = [...cards.querySelectorAll('.cn-scrap'),...decorLayer.children].map(node=>{
      const box = node.getBoundingClientRect();
      const origin = board.getBoundingClientRect();
      return {left:box.left-origin.left,right:box.right-origin.left,top:box.top-origin.top,bottom:box.bottom-origin.top};
    });
    const open = (x,y) => {
      const box = decorationBox({...piece,x,y},width);
      return occupied.every(area=>box.x+box.radiusX+7<area.left || box.x-box.radiusX-7>area.right ||
        box.y+box.radiusY+7<area.top || box.y-box.radiusY-7>area.bottom);
    };
    const candidates = [90,234,350,Math.max(410,...occupied.map(area=>area.bottom+75))]
      .flatMap(y=>[.5,.72,.27,.88,.13].map(x=>({x,y})));
    const slot = candidates.find(({x,y})=>open(x,y));
    if (slot) Object.assign(piece,slot);
    note.decorations.push(piece);
    setTool('move');
    renderDecorations();
    selectDecoration(piece.id);
    decorLayer.querySelector('[data-id="'+piece.id+'"]')?.focus({preventScroll:true});
    status(isTape ? 'テープを置きました。カードに重ねるか、固定先を選んでください。' : asset.name+'を貼りました。');
    persist();
  }

  function renderDecorations() {
    decorLayer.replaceChildren();
    for (const piece of current().decorations || []) {
      const asset = assetsById.get(piece.asset);
      if (!asset) continue;
      const node = element('button','cn-decor-piece');
      node.type = 'button';
      node.dataset.id = piece.id;
      node.dataset.asset = piece.asset;
      node.setAttribute('aria-label',asset.name+'の位置と大きさを調整');
      const image = element('img');
      image.alt = '';
      image.draggable = false;
      node.append(image);
      image.src = asset.src;
      attachDecorationMove(node,piece);
      decorLayer.append(node);
    }
    updateInspectors();
    layout();
  }

  function attachDecorationMove(node,piece) {
    let gesture;
    node.onclick = ()=>{
      if (tool==='move') {
        touchBoardItem(piece);
        selectDecoration(piece.id);
      }
    };
    node.onpointerdown = event=>{
      if (tool!=='move' || event.button!==0 || gesture || piece.pin) return;
      touchBoardItem(piece);
      const initial = decorationBox(piece,board.clientWidth);
      gesture = {id:event.pointerId,startX:event.clientX,startY:event.clientY,x:initial.x,y:initial.y,moved:false};
      node.setPointerCapture(event.pointerId);
    };
    node.onpointermove = event=>{
      if (gesture?.id!==event.pointerId) return;
      const dx = event.clientX-gesture.startX;
      const dy = event.clientY-gesture.startY;
      if (!gesture.moved && Math.hypot(dx,dy)<3) return;
      if (!gesture.moved) backup();
      gesture.moved = true;
      const width = board.clientWidth;
      const place = decorationBox({...piece,x:(gesture.x+dx)/width,y:clamp(gesture.y+dy,0,4200)},width);
      piece.x = place.x/width;
      piece.y = place.y;
      layout();
      if (tapeAssets.has(piece.asset)) setDropTarget(findDropTarget(node));
    };
    const finish = event=>{
      if (gesture?.id!==event.pointerId) return;
      const moved = gesture.moved;
      gesture = null;
      if (moved) {
        const paper = event.type==='pointerup' && tapeAssets.has(piece.asset) ? findDropTarget(node) : null;
        setDropTarget();
        selectDecoration(piece.id);
        if (paper) pinTape(piece,paper,decorationBox(piece,board.clientWidth));
        persist();
      }
    };
    node.onpointerup = finish;
    node.onpointercancel = finish;
    node.onlostpointercapture = finish;
    node.onkeydown = event=>{
      const offset = {ArrowLeft:[-12,0],ArrowRight:[12,0],ArrowUp:[0,-12],ArrowDown:[0,12]}[event.key];
      if (!offset || tool!=='move') return;
      event.preventDefault();
      if (piece.pin) {
        status('このテープは固定中です。動かすには固定を解除してください。');
        return;
      }
      backup();
      if (!tapeAssets.has(piece.asset)) setTopLayer(piece);
      const width = board.clientWidth;
      const old = decorationBox(piece,width);
      const position = decorationBox({...piece,x:(old.x+offset[0])/width,y:clamp(old.y+offset[1],0,4200)},width);
      piece.x = position.x/width;
      piece.y = position.y;
      selectDecoration(piece.id);
      layout();
      persist();
    };
  }

  bindRange(decorSize,size=>{
    const piece = selectedDecoration();
    if (!piece) return;
    if (!tapeAssets.has(piece.asset)) setTopLayer(piece);
    piece.size = size;
    updateInspectors();
    layout();
  });
  bindRange(decorAngle,angle=>{
    const piece = selectedDecoration();
    if (!piece) return;
    if (!tapeAssets.has(piece.asset)) setTopLayer(piece);
    setDecorationAngle(piece,angle);
    updateInspectors();
    layout();
  });
  query('#cn-decor-remove').onclick = ()=>{
    const piece = selectedDecoration();
    if (!piece) return;
    backup();
    if (piece.pin) detachTape(piece);
    current().decorations = current().decorations.filter(item=>item.id!==piece.id);
    selectDecoration();
    renderDecorations();
    updateTool();
    pickerToggle.focus({preventScroll:true});
    status('素材をボードから外しました。');
    persist();
  };
  query('#cn-decor-close').onclick = ()=>{
    const node = [...decorLayer.children].find(item=>item.dataset.id===selectedDecorId);
    selectDecoration();
    node?.focus({preventScroll:true});
  };
  const transformBox = query('#cn-transform');
  const rotationHandle = transformBox.querySelector('[data-handle="rotate"]');
  const cardAngle = query('#cn-card-angle');
  const paperPoses = new WeakMap();
  const smallBoard = matchMedia('(max-width:600px)');
  const coarsePointer = matchMedia('(pointer:coarse)');
  let transformGesture;

  function normalizedAngle(angle) {
    const wrapped = ((Math.round(angle)+180)%360+360)%360-180;
    return wrapped===-180 && angle>0 ? 180 : wrapped;
  }

  function turnPoint(x,y,angle) {
    const radians = angle*Math.PI/180;
    const cosine = Math.cos(radians);
    const sine = Math.sin(radians);
    return [x*cosine-y*sine,x*sine+y*cosine];
  }

  function paperPose(paper,card,boardWidth) {
    const angle = card.angle || 0;
    const [cosine,sine] = turnPoint(1,0,angle).map(Math.abs);
    const naturalWidth = paper.offsetWidth;
    const naturalHeight = paper.offsetHeight;
    const completion = paper.hasAttribute('data-done') ? (smallBoard.matches ? .86 : .82) : 1;
    const gripRoom = coarsePointer.matches ? 23 : 13;
    const scale = Math.min(completion,Math.max(1,boardWidth-2*gripRoom)/
      Math.max(1,naturalWidth*cosine+naturalHeight*sine));
    const w = naturalWidth*scale;
    const h = naturalHeight*scale;
    const radiusX = (w*cosine+h*sine)/2;
    const radiusY = (w*sine+h*cosine)/2;
    const available = Math.max(0,boardWidth-w);
    const left = Number.isFinite(card.anchorX) && isCardPinned(card.id) ?
      clamp(card.anchorX*boardWidth,0,available) : card.x*available;
    return {x:clamp(left+w/2,radiusX+gripRoom,boardWidth-radiusX-gripRoom),
      y:Math.max(card.y+h/2,radiusY+gripRoom),w,h,angle,scale,radiusX,radiusY};
  }

  function putPaperAt(card,pose,x,y) {
    card.x = clamp((x-pose.w/2)/Math.max(1,board.clientWidth-pose.w),0,1);
    card.y = clamp(y-pose.h/2,0,3900);
  }

  function decorationPose(piece,width) {
    const positioned = pinnedPosition(piece,width);
    return {...decorationBox(positioned,width),angle:positioned.angle};
  }

  function editableObject() {
    if (tool!=='move') return null;
    const card = selectedCard();
    if (card) {
      const node = cardPaper(card.id);
      if (node) return {card,node,pose:paperPoses.get(node)};
    }
    const piece = selectedDecoration();
    return piece ? {piece,pose:decorationPose(piece,board.clientWidth)} : null;
  }

  function layoutTransform(width) {
    const object = editableObject();
    transformBox.hidden = !object?.pose;
    if (!object?.pose) return 0;
    const pose = object.pose;
    const frameWidth = Math.max(52,pose.w);
    const frameHeight = Math.max(52,pose.h);
    transformBox.style.left = pose.x+'px';
    transformBox.style.top = pose.y+'px';
    transformBox.style.width = frameWidth+'px';
    transformBox.style.height = frameHeight+'px';
    transformBox.style.setProperty('--cn-handle-angle',pose.angle+'deg');
    const stem = coarsePointer.matches ? 46 : 30;
    const distance = frameHeight/2+stem;
    const [dx,dy] = turnPoint(0,-distance,pose.angle);
    const [otherX,otherY] = [-dx,-dy];
    const room = coarsePointer.matches ? 22 : 14;
    const topFits = pose.y+dy>=room && pose.x+dx>=room && pose.x+dx<=width-room;
    const bottomFits = pose.y+otherY>=room && pose.x+otherX>=room && pose.x+otherX<=width-room;
    const useBottom = !topFits && (bottomFits || pose.y+otherY>pose.y+dy);
    if (!transformGesture) transformBox.dataset.rotator = useBottom ? 'bottom' : 'top';
    const actualBottom = transformBox.dataset.rotator==='bottom';
    const knobX = pose.x + (actualBottom ? otherX : dx);
    const knobY = pose.y + (actualBottom ? otherY : dy);
    // At very tight board edges, keep the grip within reach.
    const [adjustX,adjustY] = turnPoint(clamp(knobX,room,width-room)-knobX,
      Math.max(room,knobY)-knobY,-pose.angle);
    rotationHandle.style.marginLeft = adjustX+'px';
    rotationHandle.style.marginTop = adjustY+'px';
    return Math.max(pose.y+pose.radiusY+12,Math.max(room,knobY)+room+8);
  }

  function setDecorationAngle(piece,angle) {
    const anchor = piece.pin && current().cards.find(card=>card.id===piece.pin.card);
    piece.angle = normalizedAngle(angle-(anchor?.angle || 0));
  }

  function centerDecoration(piece,x,y) {
    const width = board.clientWidth;
    const position = decorationBox({...piece,x:x/width,y:Math.max(0,y)},width);
    piece.x = position.x/width;
    piece.y = clamp(position.y,0,4200);
  }

  function transformSelection(object,handle,dx,dy,angleDelta=0) {
    const {card,piece,node,pose} = object;
    if (handle==='rotate') {
      if (card) card.angle = normalizedAngle(pose.angle+angleDelta);
      else setDecorationAngle(piece,pose.angle+angleDelta);
    } else {
      const sx = handle.endsWith('e') ? 1 : -1;
      const sy = handle.startsWith('s') ? 1 : -1;
      if (card) {
        card.width = Math.round(clamp(object.width+dx*sx/pose.scale,175,440));
        card.height = Math.round(clamp(object.height+dy*sy/pose.scale,160,420));
        applyCardDimensions(card,node);
        if (!isCardPinned(card.id)) {
          const next = paperPose(node,card,board.clientWidth);
          const offset = turnPoint(sx*(next.w-pose.w)/2,sy*(next.h-pose.h)/2,pose.angle);
          putPaperAt(card,next,pose.x+offset[0],pose.y+offset[1]);
        }
      } else {
        const factor = (dx*sx*pose.w+dy*sy*pose.h)/Math.max(1,pose.w*pose.w+pose.h*pose.h);
        piece.size = Math.round(clamp(object.size*(1+factor),30,260));
        if (!piece.pin) {
          const next = decorationPose(piece,board.clientWidth);
          const offset = turnPoint(sx*(next.w-pose.w)/2,sy*(next.h-pose.h)/2,pose.angle);
          centerDecoration(piece,pose.x+offset[0],pose.y+offset[1]);
        }
      }
    }
    updateInspectors();
    layout();
  }

  function transformStart() {
    const object = editableObject();
    if (!object?.pose) return null;
    const [width,height] = object.card ? cardDimensions(object.card) : [];
    return {...object,width,height,size:object.piece?.size};
  }

  for (const button of transformBox.querySelectorAll('button')) {
    const handle = button.dataset.handle;
    button.onpointerdown = event=>{
      if (event.button!==0 || transformGesture) return;
      const object = transformStart();
      if (!object) return;
      const bounds = ink.getBoundingClientRect();
      const centerX = bounds.left+object.pose.x;
      const centerY = bounds.top+object.pose.y;
      transformGesture = {object,id:event.pointerId,x:event.clientX,y:event.clientY,centerX,centerY,
        turn:Math.atan2(event.clientY-centerY,event.clientX-centerX),moved:false};
      button.setPointerCapture(event.pointerId);
    };
    button.onpointermove = event=>{
      const gesture = transformGesture;
      if (gesture?.id!==event.pointerId) return;
      const dx = event.clientX-gesture.x;
      const dy = event.clientY-gesture.y;
      if (!gesture.moved && Math.hypot(dx,dy)<3) return;
      if (!gesture.moved) backup();
      gesture.moved = true;
      if (handle==='rotate') {
        const angle = (Math.atan2(event.clientY-gesture.centerY,event.clientX-gesture.centerX)-gesture.turn)*180/Math.PI;
        const adjusted = event.shiftKey ? Math.round((gesture.object.pose.angle+angle)/15)*15-gesture.object.pose.angle : angle;
        transformSelection(gesture.object,handle,0,0,adjusted);
      } else {
        const local = turnPoint(dx,dy,-gesture.object.pose.angle);
        transformSelection(gesture.object,handle,...local);
      }
    };
    const finish = event=>{
      if (transformGesture?.id!==event.pointerId) return;
      const moved = transformGesture.moved;
      transformGesture = null;
      if (moved) {
        layout();
        persist();
      }
    };
    button.onpointerup = finish;
    button.onpointercancel = finish;
    button.onlostpointercapture = finish;
    button.onkeydown = event=>{
      const vector = {ArrowLeft:[-8,0],ArrowRight:[8,0],ArrowUp:[0,-8],ArrowDown:[0,8]}[event.key];
      const object = vector && transformStart();
      if (!object) return;
      event.preventDefault();
      backup();
      transformSelection(object,handle,...vector,Math.sign(vector[0] || vector[1])*(event.shiftKey ? 15 : 5));
      persist();
    };
  }

  bindRange(cardAngle,angle=>{
    const card = selectedCard();
    if (!card) return;
    card.angle = normalizedAngle(angle);
    updateInspectors();
    layout();
  });
  render();
  if (globalThis.ResizeObserver) new ResizeObserver(layout).observe(board);
  matchMedia('(prefers-color-scheme: dark)').addEventListener('change',paint);
  window.addEventListener('pagehide', () => {
    if (saveTimer !== null) persist();
  });
})();
