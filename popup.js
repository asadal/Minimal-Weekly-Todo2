// popup.js

// 요일 배열
const days = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
let isSyncing = false;
let lastSyncTime = null;

// chrome.storage.sync에서 할일 데이터를 불러옵니다.
function loadAllTasks() {
  return new Promise((resolve, reject) => {
    chrome.storage.sync.get("weeklyTasks", (data) => {
      if (chrome.runtime.lastError) {
        console.warn('Sync storage error, falling back to local:', chrome.runtime.lastError);
        // 동기화 스토리지 실패 시 로컬 스토리지에서 시도
        loadFromLocal().then(resolve).catch(reject);
      } else {
        const weeklyTasks = data.weeklyTasks || {
          Monday: [],
          Tuesday: [],
          Wednesday: [],
          Thursday: [],
          Friday: [],
          Saturday: [],
          Sunday: []
        };
        resolve(weeklyTasks);
      }
    });
  });
}

// 로컬 스토리지에서 할일 데이터를 불러옵니다.
function loadFromLocal() {
  return new Promise((resolve, reject) => {
    chrome.storage.local.get("weeklyTasks", (data) => {
      if (chrome.runtime.lastError) {
        reject(chrome.runtime.lastError);
      } else {
        const weeklyTasks = data.weeklyTasks || {
          Monday: [],
          Tuesday: [],
          Wednesday: [],
          Thursday: [],
          Friday: [],
          Saturday: [],
          Sunday: []
        };
        resolve(weeklyTasks);
      }
    });
  });
}

// 동기화 스토리지에 할일 데이터를 저장합니다.
function saveAllTasks(weeklyTasks) {
  return new Promise((resolve, reject) => {
    // 동기화 스토리지에 저장
    chrome.storage.sync.set({ weeklyTasks }, () => {
      if (chrome.runtime.lastError) {
        console.warn('Error saving to sync storage:', chrome.runtime.lastError);
        // 실패시 로컬 스토리지에 백업
        saveToLocal(weeklyTasks).then(resolve).catch(reject);
      } else {
        // 성공시에도 로컬 스토리지에 백업
        saveToLocal(weeklyTasks).then(() => resolve()).catch(() => resolve());
      }
    });
  });
}

// 로컬 스토리지에 할일 데이터를 저장합니다.
function saveToLocal(weeklyTasks) {
  return new Promise((resolve, reject) => {
    chrome.storage.local.set({ weeklyTasks }, () => {
      if (chrome.runtime.lastError) {
        reject(chrome.runtime.lastError);
      } else {
        resolve();
      }
    });
  });
}

// 두 할일 항목이 동일한지 확인하는 함수
function isSameTask(task1, task2) {
  return task1.text === task2.text;
}

// 할일 목록 병합 함수: 두 브라우저의 할일을 통합
function mergeTasks(localTasks, syncTasks) {
  const result = { ...localTasks };
  
  // 각 요일별로 처리
  days.forEach(day => {
    // 원본 배열 복사
    const localDayTasks = [...(localTasks[day] || [])];
    const syncDayTasks = [...(syncTasks[day] || [])];
    
    // 통합된 할일 목록
    const mergedTasks = [...localDayTasks];
    
    // 동기화 스토리지의 할일을 로컬에 없는 경우에만 추가
    syncDayTasks.forEach(syncTask => {
      // 동일한 텍스트의 할일이 로컬에 있는지 확인
      const existingTaskIndex = localDayTasks.findIndex(localTask => 
        isSameTask(localTask, syncTask)
      );
      
      if (existingTaskIndex === -1) {
        // 로컬에 없는 할일은 추가
        mergedTasks.push(syncTask);
      } else {
        // 이미 존재하는 경우, 완료 상태가 다르면 상태 업데이트 (일관성을 위해)
        if (syncTask.completed && !localDayTasks[existingTaskIndex].completed) {
          mergedTasks[existingTaskIndex].completed = true;
        }
      }
    });
    
    // 병합된 할일 목록 업데이트
    result[day] = mergedTasks;
  });
  
  return result;
}

// 수동 동기화 실행 함수
async function performSync() {
  if (isSyncing) return;
  
  const syncButton = document.querySelector('.sync-button');
  const syncIcon = syncButton.querySelector('.sync-icon');
  const syncText = syncButton.querySelector('.sync-text');
  const syncStatus = document.querySelector('.sync-status');
  
  // 동기화 상태 UI 업데이트
  isSyncing = true;
  syncIcon.classList.add('spinning');
  syncText.textContent = '동기화 중...';
  
  try {
    // 로컬 데이터 불러오기
    const localTasks = await loadFromLocal();
    
    // 동기화 스토리지 데이터 불러오기
    let syncTasks;
    try {
      syncTasks = await new Promise((resolve, reject) => {
        chrome.storage.sync.get("weeklyTasks", (data) => {
          if (chrome.runtime.lastError) {
            reject(chrome.runtime.lastError);
          } else {
            resolve(data.weeklyTasks || {
              Monday: [],
              Tuesday: [],
              Wednesday: [],
              Thursday: [],
              Friday: [],
              Saturday: [],
              Sunday: []
            });
          }
        });
      });
    } catch (error) {
      console.warn('동기화 스토리지에서 데이터를 불러올 수 없습니다:', error);
      // 동기화 스토리지에서 불러오기 실패 시, 로컬 데이터만 사용
      syncTasks = { ...localTasks };
    }
    
    // 할일 목록 병합
    const mergedTasks = mergeTasks(localTasks, syncTasks);
    
    // 병합된 데이터를 동기화 스토리지와 로컬 스토리지에 저장
    await new Promise((resolve, reject) => {
      chrome.storage.sync.set({ weeklyTasks: mergedTasks }, () => {
        if (chrome.runtime.lastError) {
          console.warn('동기화 스토리지에 저장 실패:', chrome.runtime.lastError);
          // 오류가 발생해도 계속 진행 (로컬 저장은 시도)
          resolve();
        } else {
          resolve();
        }
      });
    });
    
    // 로컬 스토리지에 저장
    await saveToLocal(mergedTasks);
    
    // UI 업데이트
    days.forEach((day) => {
      renderTodoList(day, mergedTasks[day]);
    });
    updateDayBadges();
    
    // 동기화 시간 저장 및 표시
    lastSyncTime = new Date();
    chrome.storage.local.set({ lastSyncTime: lastSyncTime.toISOString() });
    syncStatus.textContent = `마지막 동기화: ${lastSyncTime.toLocaleTimeString()}`;
    
    // 성공 메시지
    setTimeout(() => {
      syncStatus.textContent = `동기화 완료: ${lastSyncTime.toLocaleTimeString()}`;
    }, 1000);
  } catch (error) {
    console.error('동기화 오류:', error);
    syncStatus.textContent = `동기화 실패: ${error.message}`;
  } finally {
    // 동기화 상태 초기화
    isSyncing = false;
    syncIcon.classList.remove('spinning');
    syncText.textContent = 'Sync';
  }
}

// 할일 텍스트를 편집 모드로 전환하는 함수
function enableEditing(li, day, idx, currentText) {
  // 기존 텍스트 요소(.todo-text) 선택
  const oldTextEl = li.querySelector('.todo-text');
  if (!oldTextEl) return;

  // input 요소 생성
  const inputEl = document.createElement("input");
  inputEl.type = "text";
  inputEl.value = currentText;
  inputEl.classList.add("todo-edit-input");
  // input에 스타일을 적용하여 공간을 채우도록 함
  inputEl.style.flex = "1";
  
  // 기존 텍스트 요소를 input으로 교체
  li.replaceChild(inputEl, oldTextEl);
  inputEl.focus();

  // 저장 함수: 입력창 내용으로 할일 텍스트 업데이트 후 원래 span 또는 a로 복원
  const saveEdit = async () => {
    let newText = inputEl.value.trim();
    if (newText === "") {
      newText = currentText; // 빈값이면 원래 텍스트 유지
    }
    // 저장: chrome.storage 업데이트
    const allTasks = await loadAllTasks();
    allTasks[day][idx].text = newText;
    await saveAllTasks(allTasks);
    
    // 새 텍스트 요소 생성 및 클래스 추가
    let newTextEl;
    const urlRegex = /^(https?:\/\/[^\s]+)/;
    if (urlRegex.test(newText)) {
      newTextEl = document.createElement("a");
      newTextEl.href = newText;
      newTextEl.target = "_blank";
      newTextEl.rel = "noopener noreferrer";
    } else {
      newTextEl = document.createElement("span");
    }
    newTextEl.textContent = newText;
    newTextEl.classList.add("todo-text");
    
    // 클릭 시 다시 편집 모드로 전환
    newTextEl.addEventListener("click", () => {
      enableEditing(li, day, idx, newText);
    });
    
    // input을 새 텍스트 요소로 교체
    li.replaceChild(newTextEl, inputEl);
  };

  // Enter 키 입력 또는 포커스 아웃 시 저장
  inputEl.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      saveEdit();
    }
  });
  inputEl.addEventListener("blur", saveEdit);
}

// 특정 요일의 할일 목록(.todo-list)을 렌더링합니다.
function renderTodoList(day, tasks) {
  const ul = document.querySelector(`.todo-list[data-day="${day}"]`);
  if (!ul) return;
  ul.innerHTML = "";

  tasks.forEach((task, idx) => {
    const li = document.createElement("li");
    li.classList.add("todo-item");
    if (task.completed) {
      li.classList.add("completed");
    }

    // 체크박스 생성
    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.classList.add("todo-checkbox");
    checkbox.checked = task.completed;
    checkbox.addEventListener("change", async () => {
      const allTasks = await loadAllTasks();
      allTasks[day][idx].completed = checkbox.checked;
      await saveAllTasks(allTasks);
      li.classList.toggle("completed", checkbox.checked);
      updateDayBadges();
    });

    // 할일 텍스트 생성 (URL이면 <a> 태그, 아니면 <span>)
    const urlRegex = /^(https?:\/\/[^\s]+)/;
    let textEl;
    if (urlRegex.test(task.text)) {
      textEl = document.createElement("a");
      textEl.href = task.text;
      textEl.target = "_blank";
      textEl.rel = "noopener noreferrer";
    } else {
      textEl = document.createElement("span");
    }
    textEl.textContent = task.text;
    textEl.classList.add("todo-text");
    // 클릭 시 편집 모드로 전환
    textEl.addEventListener("click", () => {
      enableEditing(li, day, idx, task.text);
    });

    // 삭제 버튼 생성
    const delBtn = document.createElement("span");
    delBtn.classList.add("todo-delete");
    delBtn.textContent = "×";
    delBtn.addEventListener("click", async () => {
      const allTasks = await loadAllTasks();
      allTasks[day].splice(idx, 1);
      await saveAllTasks(allTasks);
      renderTodoList(day, allTasks[day]);
      updateDayBadges();
    });

    li.appendChild(checkbox);
    li.appendChild(textEl);
    li.appendChild(delBtn);
    ul.appendChild(li);
  });
}

// 모든 요일의 할일 목록을 렌더링합니다.
async function renderAllDays() {
  const allTasks = await loadAllTasks();
  days.forEach((day) => {
    renderTodoList(day, allTasks[day]);
  });
  updateDayBadges();
}

// 새 할일 추가 함수
async function addNewTask(day, taskText) {
  if (!taskText.trim()) return;
  const allTasks = await loadAllTasks();
  allTasks[day].push({ text: taskText.trim(), completed: false });
  await saveAllTasks(allTasks);
  renderTodoList(day, allTasks[day]);
  updateDayBadges();
}

// "+ Add task" 링크 클릭 시 새 할일 입력 폼을 토글합니다.
function setupAddTaskLinks() {
  const addLinks = document.querySelectorAll(".add-todo");
  addLinks.forEach((link) => {
    link.addEventListener("click", () => {
      const day = link.dataset.day;
      const form = document.querySelector(`.new-todo-form[data-day="${day}"]`);
      if (form) {
        form.classList.toggle("active");
      }
    });
  });
}

// 새 할일 입력 폼(엔터 또는 버튼 클릭) 처리
function setupNewTodoForms() {
  const forms = document.querySelectorAll(".new-todo-form");
  forms.forEach((form) => {
    const day = form.dataset.day;
    const inputEl = form.querySelector(".new-todo-input");
    const submitBtn = form.querySelector(".new-todo-submit");

    submitBtn.addEventListener("click", () => {
      addNewTask(day, inputEl.value);
      inputEl.value = "";
      form.classList.remove("active");
    });

    inputEl.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        addNewTask(day, inputEl.value);
        inputEl.value = "";
        form.classList.remove("active");
      }
    });
  });
}

// 각 요일 헤더의 미완료 할일 수를 .day-badge에 업데이트합니다.
async function updateDayBadges() {
  const allTasks = await loadAllTasks();
  days.forEach((day) => {
    const badge = document.querySelector(`.day-badge[data-day="${day}"]`);
    if (!badge) return;
    const incompleteCount = allTasks[day].filter(task => !task.completed).length;
    badge.textContent = incompleteCount > 0 ? String(incompleteCount) : "";
  });
}

// 동기화 버튼 및 상태 설정
function setupSyncButton() {
  const syncButton = document.querySelector('.sync-button');
  const syncStatus = document.querySelector('.sync-status');
  
  if (syncButton) {
    syncButton.addEventListener('click', performSync);
  }
  
  // 마지막 동기화 시간 로드
  chrome.storage.local.get(['lastSyncTime'], (result) => {
    if (result.lastSyncTime) {
      lastSyncTime = new Date(result.lastSyncTime);
      if (syncStatus) {
        syncStatus.textContent = `마지막 동기화: ${lastSyncTime.toLocaleTimeString()}`;
      }
    }
  });
}

// 초기화: 링크, 폼 처리 및 렌더링 실행
async function init() {
  setupAddTaskLinks();
  setupNewTodoForms();
  setupSyncButton();
  await renderAllDays();
  
  // 동기화 리스너 설정 - 다른 기기에서 변경사항이 있을 때 자동 업데이트
  chrome.storage.onChanged.addListener((changes, namespace) => {
    if (namespace === 'sync' && changes.weeklyTasks) {
      console.log('동기화 스토리지에서 변경 감지됨');
      renderAllDays();
    }
  });
}

document.addEventListener("DOMContentLoaded", init);