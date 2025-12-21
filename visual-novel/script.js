// 台詞データ
const dialogues = [
    { speaker: 'sakana', text: 'ここ少し行った先が現場' },
    { speaker: 'death', text: 'うん' },
    { speaker: 'sakana', text: '今度はグロくないといいな' },
    { speaker: 'death', text: 'うん' },
    { speaker: 'sakana', text: '…' },
    { speaker: 'death', text: '…' },
    { speaker: 'sakana', text: '…ところで、それ、下なにか履いてる？' },
    { speaker: 'death', text: '…いや' },
    { speaker: 'sakana', text: 'そうか…' },
    { speaker: 'death', text: 'なんで？' },
    { speaker: 'sakana', text: 'いや… 風邪ひくなよ' },
    { speaker: 'death', text: '大丈夫　ありがと' },
    { speaker: 'sakana', text: 'ん… あ、ここだ' }
];

// DOM要素
const fadeOverlay = document.getElementById('fadeOverlay');
const nameDisplay = document.getElementById('nameDisplay');
const textContent = document.getElementById('textContent');
const continueIcon = document.getElementById('continueIcon');

// 状態管理
let currentDialogueIndex = 0;
let isTyping = false;
let typingTimeout = null;
let canProceed = false;

// 名前の表示名
const speakerNames = {
    sakana: 'サカナ',
    death: 'デス'
};

// 初期化
function init() {
    // 最初は黒画面なので、フェードアウトして開始
    setTimeout(() => {
        fadeOverlay.classList.add('fade-out');

        // フェードアウト完了後に最初の台詞を表示
        setTimeout(() => {
            showDialogue(0);
        }, 2000);
    }, 500);

    // クリックイベント
    document.body.addEventListener('click', handleClick);
}

// クリックハンドラー
function handleClick() {
    if (isTyping) {
        // テキスト表示中の場合は即座に全文表示
        skipTyping();
    } else if (canProceed) {
        // 次の台詞へ進む
        proceedToNext();
    }
}

// 台詞を表示
function showDialogue(index) {
    if (index >= dialogues.length) {
        // 最後まで到達したらフェードアウトして最初に戻る
        endStory();
        return;
    }

    const dialogue = dialogues[index];
    currentDialogueIndex = index;
    canProceed = false;
    continueIcon.classList.remove('show');

    // 名前表示
    nameDisplay.textContent = speakerNames[dialogue.speaker];
    nameDisplay.className = `name-display ${dialogue.speaker}`;

    // テキストをクリア
    textContent.textContent = '';

    // テキストを一文字ずつ表示
    typeText(dialogue.text);
}

// テキストを一文字ずつ表示
function typeText(text) {
    isTyping = true;
    let charIndex = 0;

    // 「…」のみの場合は待機時間を長めに
    const isEllipsis = text === '…';
    const typingSpeed = 50; // 通常の文字表示速度（ミリ秒）

    function typeNextChar() {
        if (charIndex < text.length) {
            textContent.textContent += text[charIndex];
            charIndex++;

            typingTimeout = setTimeout(typeNextChar, typingSpeed);
        } else {
            // 表示完了
            isTyping = false;

            // 「…」の場合は少し長く待ってから進行可能にする
            const delayBeforeContinue = isEllipsis ? 800 : 300;

            setTimeout(() => {
                canProceed = true;
                continueIcon.classList.add('show');
            }, delayBeforeContinue);
        }
    }

    typeNextChar();
}

// テキスト表示をスキップ
function skipTyping() {
    if (typingTimeout) {
        clearTimeout(typingTimeout);
        typingTimeout = null;
    }

    isTyping = false;

    // 現在の台詞の全文を表示
    const dialogue = dialogues[currentDialogueIndex];
    textContent.textContent = dialogue.text;

    // 進行可能にする
    canProceed = true;
    continueIcon.classList.add('show');
}

// 次の台詞へ進む
function proceedToNext() {
    currentDialogueIndex++;
    showDialogue(currentDialogueIndex);
}

// ストーリー終了
function endStory() {
    // フェードインで黒画面にする
    fadeOverlay.classList.remove('fade-out');
    fadeOverlay.classList.add('fade-in');

    // 2秒後に最初に戻る
    setTimeout(() => {
        currentDialogueIndex = 0;

        // フェードアウトして再開
        fadeOverlay.classList.remove('fade-in');
        fadeOverlay.classList.add('fade-out');

        setTimeout(() => {
            showDialogue(0);
        }, 2000);
    }, 2000);
}

// ページ読み込み時に初期化
window.addEventListener('load', init);
