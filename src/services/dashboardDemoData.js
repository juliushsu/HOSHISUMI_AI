const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;

function toIso(baseNow, offsetMs) {
  return new Date(baseNow.getTime() - offsetMs).toISOString();
}

function toMonthString(baseNow, monthOffset = 0) {
  const date = new Date(Date.UTC(baseNow.getUTCFullYear(), baseNow.getUTCMonth() - monthOffset, 1));
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, '0');
  return `${y}-${m}`;
}

export function buildDashboardDemoDataset(now = new Date()) {
  const dashboard_marquee_events_v1 = [
    {
      id: 'mq-001',
      event_type: 'deal_closed',
      title: '西屯文華路兩房完成簽約',
      detail_text: '陳怡安協助首購客完成交屋流程。',
      branch: '台中七期店',
      occurred_at: toIso(now, 2 * HOUR_MS),
      relative_time: '今天'
    },
    {
      id: 'mq-002',
      event_type: 'new_listing',
      title: '市政北七路住宅新上架',
      detail_text: '高樓層三房，已開放預約帶看。',
      branch: '台中七期店',
      occurred_at: toIso(now, 5 * HOUR_MS),
      relative_time: '今天'
    },
    {
      id: 'mq-003',
      event_type: 'new_client',
      title: '新增日本投資客名單',
      detail_text: '佐藤健一提出大阪收租型物件需求。',
      branch: '台北信義店',
      occurred_at: toIso(now, 1 * DAY_MS + 1 * HOUR_MS),
      relative_time: '昨天'
    },
    {
      id: 'mq-004',
      event_type: 'viewing_scheduled',
      title: '文心森林公園宅安排週末帶看',
      detail_text: '預計週六下午兩組客戶同行。',
      branch: '台中七期店',
      occurred_at: toIso(now, 1 * DAY_MS + 4 * HOUR_MS),
      relative_time: '昨天'
    },
    {
      id: 'mq-005',
      event_type: 'rental_expiring',
      title: '青海路套房租約 30 天後到期',
      detail_text: '代管組已啟動續約詢問。',
      branch: '台中西屯店',
      occurred_at: toIso(now, 2 * DAY_MS),
      relative_time: '2 天前'
    },
    {
      id: 'mq-006',
      event_type: 'management_report_ready',
      title: '公益路店面代管月報已完成',
      detail_text: '3 月淨收益提升 12%。',
      branch: '台中公益店',
      occurred_at: toIso(now, 3 * DAY_MS),
      relative_time: '3 天前'
    },
    {
      id: 'mq-007',
      event_type: 'maintenance_completed',
      title: '市政北七路住宅冷氣維修結案',
      detail_text: '租客回報已恢復正常使用。',
      branch: '台中七期店',
      occurred_at: toIso(now, 4 * DAY_MS),
      relative_time: '本週'
    },
    {
      id: 'mq-008',
      event_type: 'new_employee_joined',
      title: '新人李芷晴到職',
      detail_text: '加入台北信義店，主攻自住客群。',
      branch: '台北信義店',
      occurred_at: toIso(now, 5 * DAY_MS),
      relative_time: '本週'
    },
    {
      id: 'mq-009',
      event_type: 'birthday_notice',
      title: '林經理本週生日提醒',
      detail_text: '週五將由店務準備慶生活動。',
      branch: '台中七期店',
      occurred_at: toIso(now, 6 * DAY_MS),
      relative_time: '本週'
    },
    {
      id: 'mq-010',
      event_type: 'ai_alert',
      title: 'AI 偵測東京物件詢問量上升',
      detail_text: '建議優先推送兩筆 ready_to_publish 物件。',
      branch: '跨境小組',
      occurred_at: toIso(now, 8 * DAY_MS),
      relative_time: '本月'
    },
    {
      id: 'mq-011',
      event_type: 'followup_reminder',
      title: '高意向客戶三日未回覆',
      detail_text: '請於今日完成 LINE 二次追蹤。',
      branch: '台北信義店',
      occurred_at: toIso(now, 10 * DAY_MS),
      relative_time: '本月'
    },
    {
      id: 'mq-012',
      event_type: 'exclusive_signed',
      title: '文華高中旁透天簽下專任委託',
      detail_text: '屋主同意 45 天專任銷售期。',
      branch: '台中西屯店',
      occurred_at: toIso(now, 14 * DAY_MS),
      relative_time: '本月'
    }
  ];

  const dashboard_recent_activities_v1 = [
    {
      id: 'ra-001',
      actor_name: '陳怡安',
      actor_role: '資深業務',
      target_name: '西屯文華路兩房',
      target_type: 'property',
      action_type: 'deal_closed',
      detail_text: '完成簽約，已建立交屋提醒。',
      occurred_at: toIso(now, 1 * HOUR_MS),
      relative_time: '今天',
      branch: '台中七期店'
    },
    {
      id: 'ra-002',
      actor_name: '林經理',
      actor_role: '店長',
      target_name: '市政北七路住宅',
      target_type: 'property',
      action_type: 'price_adjusted',
      detail_text: '依市場回饋下修 3%，提升曝光。',
      occurred_at: toIso(now, 3 * HOUR_MS),
      relative_time: '今天',
      branch: '台中七期店'
    },
    {
      id: 'ra-003',
      actor_name: '佐藤健一',
      actor_role: '投資客',
      target_name: '大阪難波商圈收租公寓',
      target_type: 'client',
      action_type: 'consultation_requested',
      detail_text: '希望比較三筆同區報酬率。',
      occurred_at: toIso(now, 6 * HOUR_MS),
      relative_time: '今天',
      branch: '跨境小組'
    },
    {
      id: 'ra-004',
      actor_name: '高橋一郎',
      actor_role: '既有客戶',
      target_name: '東京港區赤坂投資套房',
      target_type: 'client',
      action_type: 'followup_reply',
      detail_text: '確認可接受 1.0% 跨境服務費。',
      occurred_at: toIso(now, 1 * DAY_MS + 2 * HOUR_MS),
      relative_time: '昨天',
      branch: '台北信義店'
    },
    {
      id: 'ra-005',
      actor_name: '李芷晴',
      actor_role: '新人業務',
      target_name: '文心森林公園宅',
      target_type: 'property',
      action_type: 'viewing_scheduled',
      detail_text: '已安排兩組自住客週末看屋。',
      occurred_at: toIso(now, 1 * DAY_MS + 5 * HOUR_MS),
      relative_time: '昨天',
      branch: '台中七期店'
    },
    {
      id: 'ra-006',
      actor_name: '張書維',
      actor_role: '代管專員',
      target_name: '公益路店面',
      target_type: 'management',
      action_type: 'report_ready',
      detail_text: '3 月代管月報已送審。',
      occurred_at: toIso(now, 2 * DAY_MS + 2 * HOUR_MS),
      relative_time: '2 天前',
      branch: '台中公益店'
    },
    {
      id: 'ra-007',
      actor_name: '周品妍',
      actor_role: '行政',
      target_name: '林經理',
      target_type: 'personnel',
      action_type: 'birthday_notice',
      detail_text: '本週生日提醒已推送至店務群。',
      occurred_at: toIso(now, 2 * DAY_MS + 6 * HOUR_MS),
      relative_time: '2 天前',
      branch: '台中七期店'
    },
    {
      id: 'ra-008',
      actor_name: '黃修誠',
      actor_role: '維修協調',
      target_name: '市政北七路住宅',
      target_type: 'management',
      action_type: 'maintenance_completed',
      detail_text: '冷氣漏水問題已排除。',
      occurred_at: toIso(now, 3 * DAY_MS + 1 * HOUR_MS),
      relative_time: '3 天前',
      branch: '台中七期店'
    },
    {
      id: 'ra-009',
      actor_name: '陳怡安',
      actor_role: '資深業務',
      target_name: '王品睿',
      target_type: 'client',
      action_type: 'new_client',
      detail_text: '新增首購客，需求為西屯兩房含車位。',
      occurred_at: toIso(now, 3 * DAY_MS + 4 * HOUR_MS),
      relative_time: '3 天前',
      branch: '台中西屯店'
    },
    {
      id: 'ra-010',
      actor_name: 'AI 助理',
      actor_role: '系統',
      target_name: '東京港區赤坂投資套房',
      target_type: 'property',
      action_type: 'ai_alert',
      detail_text: '偵測到關鍵字「節稅」詢問成長。',
      occurred_at: toIso(now, 4 * DAY_MS),
      relative_time: '本週',
      branch: '跨境小組'
    },
    {
      id: 'ra-011',
      actor_name: '林經理',
      actor_role: '店長',
      target_name: '李芷晴',
      target_type: 'personnel',
      action_type: 'onboard_checkin',
      detail_text: '完成第一週陪訪回顧。',
      occurred_at: toIso(now, 5 * DAY_MS),
      relative_time: '本週',
      branch: '台北信義店'
    },
    {
      id: 'ra-012',
      actor_name: '張書維',
      actor_role: '代管專員',
      target_name: '青海路套房',
      target_type: 'management',
      action_type: 'rental_expiring',
      detail_text: '租客續約意願為「待確認」。',
      occurred_at: toIso(now, 6 * DAY_MS),
      relative_time: '本週',
      branch: '台中西屯店'
    },
    {
      id: 'ra-013',
      actor_name: '陳怡安',
      actor_role: '資深業務',
      target_name: '文華高中旁透天',
      target_type: 'property',
      action_type: 'exclusive_signed',
      detail_text: '簽下專任，排定專案攝影。',
      occurred_at: toIso(now, 9 * DAY_MS),
      relative_time: '本月',
      branch: '台中西屯店'
    },
    {
      id: 'ra-014',
      actor_name: '周品妍',
      actor_role: '行政',
      target_name: '4 月週報',
      target_type: 'operation',
      action_type: 'management_report_ready',
      detail_text: '跨店匯總版本已上傳。',
      occurred_at: toIso(now, 11 * DAY_MS),
      relative_time: '本月',
      branch: '總管理處'
    },
    {
      id: 'ra-015',
      actor_name: 'AI 助理',
      actor_role: '系統',
      target_name: '高意向客戶池',
      target_type: 'client',
      action_type: 'followup_reminder',
      detail_text: '7 位客戶超過 48 小時未追蹤。',
      occurred_at: toIso(now, 13 * DAY_MS),
      relative_time: '本月',
      branch: '台北信義店'
    }
  ];

  const dashboard_sales_pipeline_v1 = [
    {
      id: 'sp-001',
      client_name: '佐藤健一',
      client_segment: 'japan_investor',
      pipeline_stage: 'negotiation',
      assigned_agent: '資深業務（日本投資客）',
      next_step: '提供兩筆大阪物件試算表',
      updated_at: toIso(now, 4 * HOUR_MS)
    },
    {
      id: 'sp-002',
      client_name: '陳怡安',
      client_segment: 'self_use_family',
      pipeline_stage: 'viewing',
      assigned_agent: '一般業務（台灣自住）',
      next_step: '週六安排文心森林公園宅二次帶看',
      updated_at: toIso(now, 1 * DAY_MS)
    },
    {
      id: 'sp-003',
      client_name: '黃柏諺',
      client_segment: 'investment',
      pipeline_stage: 'proposal',
      assigned_agent: '資深業務（日本投資客）',
      next_step: '比較台中與大阪租報酬模型',
      updated_at: toIso(now, 2 * DAY_MS)
    },
    {
      id: 'sp-004',
      client_name: '王品睿',
      client_segment: 'first_time_buyer',
      pipeline_stage: 'qualification',
      assigned_agent: '新人',
      next_step: '補齊貸款條件與自備款規劃',
      updated_at: toIso(now, 3 * DAY_MS)
    },
    {
      id: 'sp-005',
      client_name: '林美雪',
      client_segment: 'landlord',
      pipeline_stage: 'exclusive_contract',
      assigned_agent: '一般業務（台灣自住）',
      next_step: '完成專任上架素材與文案',
      updated_at: toIso(now, 4 * DAY_MS)
    },
    {
      id: 'sp-006',
      client_name: '高橋一郎',
      client_segment: 'japan_investor',
      pipeline_stage: 'contract_prep',
      assigned_agent: '資深業務（日本投資客）',
      next_step: '確認匯款節點與代辦文件',
      updated_at: toIso(now, 5 * DAY_MS)
    },
    {
      id: 'sp-007',
      client_name: '張雅文',
      client_segment: 'self_use_single',
      pipeline_stage: 'followup',
      assigned_agent: '新人',
      next_step: 'LINE 回覆通勤條件與學區偏好',
      updated_at: toIso(now, 6 * DAY_MS)
    },
    {
      id: 'sp-008',
      client_name: '李承翰',
      client_segment: 'high_net_worth',
      pipeline_stage: 'closing',
      assigned_agent: '資深業務（日本投資客）',
      next_step: '確認成交價與交屋日期',
      updated_at: toIso(now, 9 * DAY_MS)
    }
  ];

  const dashboard_management_summary_v1 = [
    {
      id: 'mg-001',
      property_name: '公益路店面',
      month: toMonthString(now, 0),
      income_total: 132000,
      expense_total: 23800,
      net_income: 108200,
      major_expense_category: '設備維修',
      report_status: 'ready'
    },
    {
      id: 'mg-002',
      property_name: '青海路套房',
      month: toMonthString(now, 0),
      income_total: 27800,
      expense_total: 5200,
      net_income: 22600,
      major_expense_category: '清潔與耗材',
      report_status: 'reviewing'
    },
    {
      id: 'mg-003',
      property_name: '市政北七路住宅',
      month: toMonthString(now, 1),
      income_total: 48600,
      expense_total: 8900,
      net_income: 39700,
      major_expense_category: '家電維護',
      report_status: 'ready'
    },
    {
      id: 'mg-004',
      property_name: '西屯文華路兩房',
      month: toMonthString(now, 1),
      income_total: 36500,
      expense_total: 11300,
      net_income: 25200,
      major_expense_category: '仲介服務費',
      report_status: 'pending'
    }
  ];

  const dashboard_personnel_reminders_v1 = [
    {
      id: 'pr-001',
      employee_name: '林經理',
      reminder_type: 'birthday',
      effective_date: toIso(now, -2 * DAY_MS),
      display_text: '林經理生日將於後天，請安排店內慶生。'
    },
    {
      id: 'pr-002',
      employee_name: '李芷晴',
      reminder_type: 'onboard',
      effective_date: toIso(now, 0),
      display_text: '新人到職第 7 天，建議安排陪訪回顧。'
    },
    {
      id: 'pr-003',
      employee_name: '周品妍',
      reminder_type: 'probation',
      effective_date: toIso(now, -7 * DAY_MS),
      display_text: '試用期評核將於本週截止。'
    },
    {
      id: 'pr-004',
      employee_name: '張書維',
      reminder_type: 'attendance_alert',
      effective_date: toIso(now, 1 * DAY_MS),
      display_text: '本月出勤異常達 2 次，請主管關懷。'
    }
  ];

  return {
    dashboard_marquee_events_v1,
    dashboard_recent_activities_v1,
    dashboard_sales_pipeline_v1,
    dashboard_management_summary_v1,
    dashboard_personnel_reminders_v1
  };
}
