// background.js

// 아이콘 배지 업데이트 함수 내에서 배경색 수정
function updateIconBadge() {
  chrome.storage.sync.get("weeklyTasks", (data) => {
    const weeklyTasks = data.weeklyTasks || {
      Monday: [],
      Tuesday: [],
      Wednesday: [],
      Thursday: [],
      Friday: [],
      Saturday: [],
      Sunday: []
    };
    let incompleteCount = 0;
    Object.keys(weeklyTasks).forEach((day) => {
      incompleteCount += weeklyTasks[day].filter(task => !task.completed).length;
    });
    const badgeText = incompleteCount > 0 ? String(incompleteCount) : "";
    chrome.action.setBadgeText({ text: badgeText });
    // 아이콘 배지 배경색을 #9EE3FF으로 수정
    chrome.action.setBadgeBackgroundColor({ color: "#9EE3FF" });
  });
}

// 확장 프로그램 설치/업데이트 시 알람 설정 + 배지 업데이트
chrome.runtime.onInstalled.addListener(() => {
  // 매일 24시간 간격 알람
  chrome.alarms.create("dailyAlarm", { periodInMinutes: 1440 });
  updateIconBadge();
});

// 알람 발생 시 오늘 요일의 미완료 할일 확인 후 알림
chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === "dailyAlarm") {
    const dayNames = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
    const todayName = dayNames[new Date().getDay()];
    chrome.storage.sync.get("weeklyTasks", (data) => {
      const weeklyTasks = data.weeklyTasks || {};
      const tasksToday = weeklyTasks[todayName] || [];
      const incompleteCount = tasksToday.filter(t => !t.completed).length;
      if (incompleteCount > 0) {
        chrome.notifications.create({
          type: "basic",
          iconUrl: "icon.png",
          title: `[${todayName}] 할 일 알림`,
          message: `오늘 미완료된 할 일이 ${incompleteCount}개 있습니다.`
        });
      }
    });
  }
});

// 저장소 변경 시 아이콘 배지 갱신
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === "sync" && changes.weeklyTasks) {
    updateIconBadge();
  }
});