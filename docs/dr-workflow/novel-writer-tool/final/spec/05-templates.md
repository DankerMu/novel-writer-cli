## 6. Templates

### 6.1 项目简介模板

## 文件路径：`templates/brief-template.md`

````markdown
# 创作纲领

## 基本信息

- **书名**：{book_title}
- **题材**：{genre}（如：玄幻、都市、悬疑、言情、科幻）
- **目标字数**：{target_word_count} 万字
- **目标卷数**：{target_volumes} 卷
- **每卷章数**：{chapters_per_volume} 章

## 核心设定

### 世界观一句话

{world_one_liner}

### 核心冲突

{core_conflict}

### 主角概念

- **姓名**：{protagonist_name}
- **身份**：{protagonist_identity}
- **目标**：{protagonist_goal}
- **内在矛盾**：{protagonist_contradiction}

## 风格定位

- **基调**：{tone}（如：轻松幽默、热血燃向、暗黑压抑、细腻温暖）
- **节奏**：{pacing}（如：快节奏爽文、慢热型、张弛交替）
- **参考作品**：{reference_works}
- **风格样本来源**：{style_source}（original / reference / template）

## 读者画像

- **目标平台**：{platform}
- **目标读者**：{target_reader}
- **核心卖点**：{selling_point}

## 备注

{notes}
````

---

### 6.2 AI 用语黑名单

## 文件路径：`templates/ai-blacklist.json`

````markdown
```json
{
  "version": "2.0.0",
  "description": "AI 高频中文用语黑名单 — 生成时禁止使用（支持 replacement_hint / per_chapter_max / category_metadata: narration_only + genre_override）",
  "last_updated": "2026-03-05",
  "max_words": 250,
  "words": [
    "总而言之",
    "综上所述",
    "总的来说",
    "总体来说",
    "总体而言",
    "简而言之",
    "一言以蔽之",
    "归根结底",
    "说到底",
    "本质上",
    "值得注意的是",
    "需要指出的是",
    "需要说明的是",
    "需要强调的是",
    "值得一提的是",
    "毋庸置疑",
    "不言而喻",
    "毫无疑问",
    "综观来看",
    "归结起来",
    "首先",
    "其次",
    "最后",
    "首先是",
    "其次是",
    "最后是",
    "一方面",
    "另一方面",
    "其一",
    "其二",
    "其三",
    "再者",
    "显而易见",
    "不可否认",
    "从某种程度上说",
    "在某种意义上",
    "具有重要意义",
    "意义深远",
    "基于",
    "鉴于",
    "考虑到",
    "诸如",
    "例如",
    "旨在",
    "致力于",
    "着力",
    "深刻地",
    "充分地",
    "相应的",
    "相关的",
    "进而",
    "从而",
    "在此基础上",
    "在此背景下",
    "在这种情况下",
    "月光如水",
    "月光倾泻",
    "阳光明媚",
    "阳光灿烂",
    "微风拂面",
    "清风徐来",
    "万籁俱寂",
    "鸦雀无声",
    "如诗如画",
    "美不胜收",
    "璀璨夺目",
    "瑰丽",
    "绚烂",
    "绮丽",
    "夜色如墨",
    "夜幕低垂",
    "星光点点",
    "繁星点点",
    "晨光熹微",
    "雾气弥漫",
    "云雾缭绕",
    "波光粼粼",
    "夕阳西下",
    "晚霞满天",
    "雷声滚滚",
    "雨声淅沥",
    "寒风刺骨",
    "就这样",
    "于是乎",
    "话说回来",
    "言归正传",
    "不得不说",
    "不得不承认",
    "说起来",
    "要知道",
    "紧接着",
    "随即",
    "只见",
    "但见",
    "转眼间",
    "眨眼间",
    "顷刻间",
    "霎那间",
    "下一刻",
    "一时间",
    "随之而来",
    "旋即",
    "继而",
    "转瞬间",
    "时间来到了",
    "让我们把目光转向",
    "回到这边",
    "回到另一边",
    "镜头一转",
    "话说当年",
    "故事还要从",
    "事情还要从",
    "夜幕降临",
    "让我们回到",
    "把镜头转向",
    "故事要从",
    "此刻",
    "这一刻",
    "就在这时",
    "就在此时",
    "话音刚落",
    "下一秒",
    "下一瞬",
    "下一息",
    "片刻之后",
    "转瞬之间",
    "就在那一刻",
    "就在下一秒",
    "随着时间的推移",
    "在这个过程中",
    "不知不觉间",
    "不知不觉中",
    "不久之后",
    "没过多久",
    "过了一会儿",
    "时光荏苒",
    "转眼之间",
    "转瞬即逝",
    "光阴似箭",
    "日复一日",
    "不禁",
    "不由得",
    "莫名",
    "油然而生",
    "心中暗道",
    "一股暖流",
    "心头一震",
    "心中一凛",
    "心中掀起波澜",
    "如释重负",
    "内心深处",
    "百感交集",
    "五味杂陈",
    "心如刀割",
    "心如死灰",
    "心中涌起一股",
    "不禁感到",
    "心里咯噔一下",
    "心里一沉",
    "心跳漏了一拍",
    "心脏猛地一跳",
    "热血沸腾",
    "激动万分",
    "嘴角微微上扬",
    "嘴角勾起一抹弧度",
    "眼中闪过一丝",
    "嘴角微扬",
    "眼神中带着一丝",
    "嘴角露出一丝笑意",
    "眉头微皱",
    "眼中闪过一抹异色",
    "目光如炬",
    "目光灼灼",
    "面色一沉",
    "神色一凛",
    "神色微变",
    "脸色一变",
    "眸光一闪",
    "眼底闪过一抹",
    "目光复杂",
    "眼神复杂",
    "宛如",
    "恍若",
    "仿佛置身于",
    "深吸一口气",
    "紧握双拳",
    "瞳孔骤缩",
    "浑身一震",
    "仿佛被什么击中",
    "缓缓开口",
    "缓缓说道",
    "微微一笑",
    "淡淡一笑",
    "轻轻一笑",
    "轻轻叹了口气",
    "长长地舒了口气",
    "脚步一顿",
    "身形一滞",
    "不由自主地",
    "下意识地",
    "下意识地后退",
    "忍不住",
    "忍不住地笑",
    "忍不住地皱眉",
    "伸手揉了揉眉心",
    "抬手擦了擦冷汗",
    "缓缓抬起头",
    "缓缓转身",
    "缓缓伸出手",
    "某种程度上",
    "某种意义上",
    "难以形容",
    "无法言喻",
    "不可名状",
    "说不清道不明",
    "难以言喻",
    "无法用言语形容",
    "让人难以置信",
    "不可思议",
    "难以想象",
    "各种各样"
  ],
  "categories": {
    "summary_word": [
      { "word": "总而言之", "replacement_hint": "删除总结语，直接给结论或用事件收束" },
      { "word": "综上所述", "replacement_hint": "删除总结语，直接给结论或用事件收束" },
      { "word": "总的来说", "replacement_hint": "删除总结语，直接给结论或用事件收束" },
      { "word": "总体来说", "replacement_hint": "删除总结语，直接给结论或用事件收束" },
      { "word": "总体而言", "replacement_hint": "删除总结语，直接给结论或用事件收束" },
      { "word": "简而言之", "replacement_hint": "删除总结语，直接给结论或用事件收束" },
      { "word": "一言以蔽之", "replacement_hint": "删除总结语，直接给结论或用事件收束" },
      { "word": "归根结底", "replacement_hint": "用具体事件说明，不要抽象总结" },
      { "word": "说到底", "replacement_hint": "用具体事件说明，不要抽象总结" },
      { "word": "本质上", "replacement_hint": "用具体事件说明，不要抽象总结" },
      { "word": "值得注意的是", "replacement_hint": "删掉提示语，直接叙述要点" },
      { "word": "需要指出的是", "replacement_hint": "删掉提示语，直接叙述要点" },
      { "word": "需要说明的是", "replacement_hint": "删掉提示语，直接叙述要点" },
      { "word": "需要强调的是", "replacement_hint": "删掉提示语，直接叙述要点" },
      { "word": "值得一提的是", "replacement_hint": "删掉提示语，直接叙述要点" },
      { "word": "毋庸置疑", "replacement_hint": "删除，或用动作/反应代替" },
      { "word": "不言而喻", "replacement_hint": "删除，或用动作/反应代替" },
      { "word": "毫无疑问", "replacement_hint": "删除，或用动作/反应代替" },
      { "word": "综观来看", "replacement_hint": "删除总结语，直接给结论或用事件收束" },
      { "word": "归结起来", "replacement_hint": "删除总结语，直接给结论或用事件收束" }
    ],
    "enumeration_template": [
      { "word": "首先", "replacement_hint": "用场景转换或动作串联，不要用编号推进", "per_chapter_max": 2 },
      { "word": "其次", "replacement_hint": "用场景转换或动作串联，不要用编号推进", "per_chapter_max": 2 },
      { "word": "最后", "replacement_hint": "用场景转换或动作串联，不要用编号推进", "per_chapter_max": 2 },
      { "word": "首先是", "replacement_hint": "用场景转换或动作串联，不要用编号推进", "per_chapter_max": 2 },
      { "word": "其次是", "replacement_hint": "用场景转换或动作串联，不要用编号推进", "per_chapter_max": 2 },
      { "word": "最后是", "replacement_hint": "用场景转换或动作串联，不要用编号推进", "per_chapter_max": 2 },
      { "word": "一方面", "replacement_hint": "用对比场景代替，不要写成讲义式对照" },
      { "word": "另一方面", "replacement_hint": "用对比场景代替，不要写成讲义式对照" },
      { "word": "其一", "replacement_hint": "删除编号，融入叙事" },
      { "word": "其二", "replacement_hint": "删除编号，融入叙事" },
      { "word": "其三", "replacement_hint": "删除编号，融入叙事" },
      { "word": "再者", "replacement_hint": "用场景推进代替逻辑推进" }
    ],
    "academic_tone": [
      { "word": "显而易见", "replacement_hint": "删除，或改为具体事实/细节" },
      { "word": "不可否认", "replacement_hint": "删除，或改为具体事实/细节" },
      { "word": "从某种程度上说", "replacement_hint": "删除这类缓冲语，直接说结论" },
      { "word": "在某种意义上", "replacement_hint": "删除这类缓冲语，直接说结论" },
      { "word": "具有重要意义", "replacement_hint": "用具体影响/后果代替抽象评价" },
      { "word": "意义深远", "replacement_hint": "用具体影响/后果代替抽象评价" },
      { "word": "基于", "replacement_hint": "改成口语化因果（因为/所以）或直接省略" },
      { "word": "鉴于", "replacement_hint": "改成口语化因果（因为/所以）或直接省略" },
      { "word": "考虑到", "replacement_hint": "改成口语化因果（因为/所以）或直接省略" },
      { "word": "诸如", "replacement_hint": "直接给出例子", "per_chapter_max": 2 },
      { "word": "例如", "replacement_hint": "直接给出例子（避免解释腔）", "per_chapter_max": 2 },
      { "word": "旨在", "replacement_hint": "改成更口语的动词（想要/打算/为了）" },
      { "word": "致力于", "replacement_hint": "改成更口语的动词（想要/打算/为了）" },
      { "word": "着力", "replacement_hint": "改成更口语的动词（盯着/专门/干脆）" },
      { "word": "深刻地", "replacement_hint": "不要用抽象副词堆砌，改为具体反应" },
      { "word": "充分地", "replacement_hint": "多数情况可删除，或改为具体程度" },
      { "word": "相应的", "replacement_hint": "能省就省，改为更直接的说法" },
      { "word": "相关的", "replacement_hint": "能省就省，改为更直接的说法" },
      { "word": "进而", "replacement_hint": "改为更口语的连接（然后/接着）或直接并列" },
      { "word": "从而", "replacement_hint": "改为更口语的连接（然后/于是）或直接并列" },
      { "word": "在此基础上", "replacement_hint": "改成更具体的时间/动作衔接" },
      { "word": "在此背景下", "replacement_hint": "改成更具体的场景/信息交代" },
      { "word": "在这种情况下", "replacement_hint": "改成更具体的场景/信息交代" }
    ],
    "narration_connector": [
      { "word": "然而", "replacement_hint": "少用逻辑连接词，用动作/场景转场" },
      { "word": "不过", "replacement_hint": "少用逻辑连接词，用动作/场景转场" },
      { "word": "因此", "replacement_hint": "少用逻辑连接词，用动作/场景转场" },
      { "word": "尽管如此", "replacement_hint": "简化为“但”，或用动作/场景转场" },
      { "word": "与此同时", "replacement_hint": "用场景切换代替" },
      { "word": "在此期间", "replacement_hint": "用场景切换代替" },
      { "word": "换言之", "replacement_hint": "删除，读者不需要解释腔" },
      { "word": "也就是说", "replacement_hint": "删除，读者不需要解释腔" },
      { "word": "事实上", "replacement_hint": "多数可删除，避免口头禅式强调" },
      { "word": "实际上", "replacement_hint": "多数可删除，避免口头禅式强调" },
      { "word": "反之", "replacement_hint": "改为具体对比场景，不要逻辑推演" },
      { "word": "总之", "replacement_hint": "删除总结语，直接叙述" }
    ],
    "environment_cliche": [
      { "word": "月光如水", "replacement_hint": "用具体颜色/形状/光线/气味/声音描写" },
      { "word": "月光倾泻", "replacement_hint": "用具体颜色/形状/光线/气味/声音描写" },
      { "word": "阳光明媚", "replacement_hint": "用具体颜色/形状/光线/气味/声音描写" },
      { "word": "阳光灿烂", "replacement_hint": "用具体颜色/形状/光线/气味/声音描写" },
      { "word": "微风拂面", "replacement_hint": "写风带来的气味/温度/声音，而不是一句套话" },
      { "word": "清风徐来", "replacement_hint": "写风带来的气味/温度/声音，而不是一句套话" },
      { "word": "万籁俱寂", "replacement_hint": "写安静中能听到的小声音，而不是一句套话" },
      { "word": "鸦雀无声", "replacement_hint": "写安静中能听到的小声音，而不是一句套话" },
      { "word": "如诗如画", "replacement_hint": "删除，改为具体画面细节" },
      { "word": "美不胜收", "replacement_hint": "删除，改为具体画面细节" },
      { "word": "璀璨夺目", "replacement_hint": "用具体颜色/形状/光线描写" },
      { "word": "瑰丽", "replacement_hint": "用具体颜色/形状/光线描写" },
      { "word": "绚烂", "replacement_hint": "用具体颜色/形状/光线描写" },
      { "word": "绮丽", "replacement_hint": "用具体颜色/形状/光线描写" },
      { "word": "夜色如墨", "replacement_hint": "写夜色的层次、光源与阴影" },
      { "word": "夜幕低垂", "replacement_hint": "写夜色的层次、光源与阴影" },
      { "word": "星光点点", "replacement_hint": "写星光的明暗、稀疏与位置" },
      { "word": "繁星点点", "replacement_hint": "写星光的明暗、稀疏与位置" },
      { "word": "晨光熹微", "replacement_hint": "写清楚光线从哪里来，照在什么上" },
      { "word": "雾气弥漫", "replacement_hint": "写雾的湿度、味道、遮蔽范围" },
      { "word": "云雾缭绕", "replacement_hint": "写雾的湿度、味道、遮蔽范围" },
      { "word": "波光粼粼", "replacement_hint": "写光的反射、颜色与水面状态" },
      { "word": "夕阳西下", "replacement_hint": "写光线角度、颜色与影子的变化" },
      { "word": "晚霞满天", "replacement_hint": "写颜色层次与云的形状" },
      { "word": "雷声滚滚", "replacement_hint": "写雷声远近、回响与人物反应" },
      { "word": "雨声淅沥", "replacement_hint": "写雨点的质感、落点与声音" },
      { "word": "寒风刺骨", "replacement_hint": "写冷如何落在皮肤/衣物/呼吸上" }
    ],
    "narrative_filler": [
      { "word": "就这样", "replacement_hint": "删除填充词，用动作/事件推进" },
      { "word": "于是乎", "replacement_hint": "删除填充词，用动作/事件推进" },
      { "word": "话说回来", "replacement_hint": "删除，叙事不需要“回到正题”" },
      { "word": "言归正传", "replacement_hint": "删除，叙事不需要“回到正题”" },
      { "word": "不得不说", "replacement_hint": "删除，或改为具体感受/动作" },
      { "word": "不得不承认", "replacement_hint": "删除，或改为具体感受/动作" },
      { "word": "说起来", "replacement_hint": "多数可删除，直接叙述" },
      { "word": "要知道", "replacement_hint": "多数可删除，直接叙述" },
      { "word": "紧接着", "replacement_hint": "保留一个转场词即可，其余用动作衔接" },
      { "word": "随即", "replacement_hint": "保留一个转场词即可，其余用动作衔接" },
      { "word": "只见", "replacement_hint": "每章限频，用更具体的动作描写替代", "per_chapter_max": 2 },
      { "word": "但见", "replacement_hint": "每章限频，用更具体的动作描写替代", "per_chapter_max": 2 },
      { "word": "转眼间", "replacement_hint": "用具体时间/动作描述代替" },
      { "word": "眨眼间", "replacement_hint": "用具体时间/动作描述代替" },
      { "word": "顷刻间", "replacement_hint": "用具体时间/动作描述代替" },
      { "word": "霎那间", "replacement_hint": "用具体时间/动作描述代替" },
      { "word": "一时间", "replacement_hint": "用具体动作/信息衔接代替" },
      { "word": "随之而来", "replacement_hint": "用具体动作/信息衔接代替" },
      { "word": "旋即", "replacement_hint": "用具体动作/信息衔接代替" },
      { "word": "继而", "replacement_hint": "用具体动作/信息衔接代替" },
      { "word": "转瞬间", "replacement_hint": "用具体时间/动作描述代替" }
    ],
    "mechanical_opening": [
      { "word": "时间来到了", "replacement_hint": "用场景/动作切入，不要用旁白开场" },
      { "word": "让我们把目光转向", "replacement_hint": "直接切换场景，不要用镜头语言" },
      { "word": "回到这边", "replacement_hint": "直接切换场景，不要用镜头语言" },
      { "word": "回到另一边", "replacement_hint": "直接切换场景，不要用镜头语言" },
      { "word": "镜头一转", "replacement_hint": "直接切换场景，不要用镜头语言" },
      { "word": "话说当年", "replacement_hint": "直接切入事件，不要用评书腔开头" },
      { "word": "故事还要从", "replacement_hint": "直接从事件切入，不要倒叙旁白" },
      { "word": "事情还要从", "replacement_hint": "直接从事件切入，不要倒叙旁白" },
      { "word": "夜幕降临", "replacement_hint": "若作开头，改为角色动作+具体环境细节" },
      { "word": "让我们回到", "replacement_hint": "直接切换场景，不要用镜头语言" },
      { "word": "把镜头转向", "replacement_hint": "直接切换场景，不要用镜头语言" },
      { "word": "故事要从", "replacement_hint": "直接从事件切入，不要倒叙旁白" }
    ],
    "paragraph_opener": [
      { "word": "此刻", "replacement_hint": "避免套路段首，改为具体动作/信息" },
      { "word": "这一刻", "replacement_hint": "避免套路段首，改为具体动作/信息" },
      { "word": "就在这时", "replacement_hint": "避免套路段首，改为具体动作/信息" },
      { "word": "就在此时", "replacement_hint": "避免套路段首，改为具体动作/信息" },
      { "word": "话音刚落", "replacement_hint": "避免套路段首，改为具体动作/信息" },
      { "word": "下一刻", "replacement_hint": "避免套路段首，改为具体动作/信息" },
      { "word": "下一秒", "replacement_hint": "避免套路段首，改为具体动作/信息" },
      { "word": "下一瞬", "replacement_hint": "避免套路段首，改为具体动作/信息" },
      { "word": "下一息", "replacement_hint": "避免套路段首，改为具体动作/信息" },
      { "word": "片刻之后", "replacement_hint": "避免套路段首，改为具体动作/信息" },
      { "word": "转瞬之间", "replacement_hint": "避免套路段首，改为具体动作/信息" },
      { "word": "就在那一刻", "replacement_hint": "避免套路段首，改为具体动作/信息" },
      { "word": "就在下一秒", "replacement_hint": "避免套路段首，改为具体动作/信息" }
    ],
    "smooth_transition": [
      { "word": "随着时间的推移", "replacement_hint": "用具体时间/动作转场，不要用套话" },
      { "word": "在这个过程中", "replacement_hint": "用具体时间/动作转场，不要用套话" },
      { "word": "不知不觉间", "replacement_hint": "用具体时间/动作转场，不要用套话" },
      { "word": "不知不觉中", "replacement_hint": "用具体时间/动作转场，不要用套话" },
      { "word": "不久之后", "replacement_hint": "用具体时间/动作转场，不要用套话" },
      { "word": "没过多久", "replacement_hint": "用具体时间/动作转场，不要用套话" },
      { "word": "过了一会儿", "replacement_hint": "用具体时间/动作转场，不要用套话" },
      { "word": "时光荏苒", "replacement_hint": "用具体时间/动作转场，不要用套话" },
      { "word": "转眼之间", "replacement_hint": "用具体时间/动作转场，不要用套话" },
      { "word": "转瞬即逝", "replacement_hint": "用具体时间/动作转场，不要用套话" },
      { "word": "光阴似箭", "replacement_hint": "用具体时间/动作转场，不要用套话" },
      { "word": "日复一日", "replacement_hint": "用具体时间/动作转场，不要用套话" }
    ],
    "emotion_cliche": [
      { "word": "不禁", "replacement_hint": "删除“不可控”提示，直接写反应/动作", "per_chapter_max": 1 },
      { "word": "不由得", "replacement_hint": "删除，直接写动作/反应" },
      { "word": "莫名", "replacement_hint": "删掉模糊词，写清楚原因与感受" },
      { "word": "油然而生", "replacement_hint": "删掉抽象触发词，写清楚触发点" },
      { "word": "心中暗道", "replacement_hint": "用更具体的内心独白/动作替代", "per_chapter_max": 1 },
      { "word": "一股暖流", "replacement_hint": "用身体反应/具体记忆代替抽象比喻" },
      { "word": "心头一震", "replacement_hint": "用身体反应代替（手心发紧/呼吸一滞）" },
      { "word": "心中一凛", "replacement_hint": "用身体反应代替（后背发凉/脚步一顿）" },
      { "word": "心中掀起波澜", "replacement_hint": "写出具体是哪几种感受与触发点" },
      { "word": "如释重负", "replacement_hint": "用动作/呼吸变化展示松弛感" },
      { "word": "内心深处", "replacement_hint": "删除抽象定位，直接写想法/反应" },
      { "word": "百感交集", "replacement_hint": "写出具体是哪几种感受" },
      { "word": "五味杂陈", "replacement_hint": "写出具体是哪几种感受" },
      { "word": "心如刀割", "replacement_hint": "除非对话，否则用具体动作/生理反应替代" },
      { "word": "心如死灰", "replacement_hint": "除非对话，否则用具体动作/生理反应替代" },
      { "word": "心中涌起一股", "replacement_hint": "用生理反应代替（喉咙发紧/手指发麻）" },
      { "word": "不禁感到", "replacement_hint": "删除“不禁”，直接写感受或动作" },
      { "word": "心里咯噔一下", "replacement_hint": "用具体动作/呼吸变化替代" },
      { "word": "心里一沉", "replacement_hint": "用具体动作/呼吸变化替代" },
      { "word": "心跳漏了一拍", "replacement_hint": "用具体动作/呼吸变化替代" },
      { "word": "心脏猛地一跳", "replacement_hint": "用具体动作/呼吸变化替代" },
      { "word": "热血沸腾", "replacement_hint": "用身体反应/动作展示兴奋感" },
      { "word": "激动万分", "replacement_hint": "用身体反应/动作展示兴奋感" }
    ],
    "expression_cliche": [
      { "word": "嘴角微微上扬", "replacement_hint": "写清楚笑的方式与原因，避免模板表情" },
      { "word": "嘴角勾起一抹弧度", "replacement_hint": "写清楚笑的方式与原因，避免模板表情" },
      { "word": "眼中闪过一丝", "replacement_hint": "把“闪过”具体化（看向哪/因何变化）" },
      { "word": "嘴角微扬", "replacement_hint": "写清楚笑的方式与原因，避免模板表情" },
      { "word": "眼神中带着一丝", "replacement_hint": "把“带着一丝”具体化（动作/语气/视线）" },
      { "word": "嘴角露出一丝笑意", "replacement_hint": "写清楚笑的方式与原因，避免模板表情" },
      { "word": "眉头微皱", "replacement_hint": "每章限频，用更具体的动作/原因替代", "per_chapter_max": 1 },
      { "word": "眼中闪过一抹异色", "replacement_hint": "把“异色”具体化（喜/疑/惧/狠）" },
      { "word": "目光如炬", "replacement_hint": "用具体眼神描写代替（盯住哪里/压迫感如何）" },
      { "word": "目光灼灼", "replacement_hint": "用具体眼神描写代替（盯住哪里/压迫感如何）" },
      { "word": "面色一沉", "replacement_hint": "用更具体的表情/动作替代（下颌绷紧/声音变冷）" },
      { "word": "神色一凛", "replacement_hint": "用更具体的表情/动作替代" },
      { "word": "神色微变", "replacement_hint": "用更具体的表情/动作替代" },
      { "word": "脸色一变", "replacement_hint": "用更具体的表情/动作替代" },
      { "word": "眸光一闪", "replacement_hint": "把“闪”具体化（看向哪/因何变化）" },
      { "word": "眼底闪过一抹", "replacement_hint": "把“闪过”具体化（喜/疑/惧/狠）" },
      { "word": "目光复杂", "replacement_hint": "写出复杂由哪些情绪组成，用动作/停顿展示" },
      { "word": "眼神复杂", "replacement_hint": "写出复杂由哪些情绪组成，用动作/停顿展示" }
    ],
    "simile_cliche": [
      { "word": "宛如", "replacement_hint": "每段至多保留一个比喻，优先直写本体与触感" },
      { "word": "恍若", "replacement_hint": "每段至多保留一个比喻，优先直写本体与触感" },
      { "word": "仿佛置身于", "replacement_hint": "直接写环境变化与感官细节，不要借套话跳场" }
    ],
    "action_cliche": [
      { "word": "深吸一口气", "replacement_hint": "每章限频，或改为具体呼吸/动作描写", "per_chapter_max": 1 },
      { "word": "紧握双拳", "replacement_hint": "用更具体动作替代（指节发白/手心出汗）" },
      { "word": "瞳孔骤缩", "replacement_hint": "用更具体反应替代（视线一滞/呼吸一顿）" },
      { "word": "浑身一震", "replacement_hint": "用更具体反应替代（脚下一软/肩膀一僵）" },
      { "word": "仿佛被什么击中", "replacement_hint": "写清楚被什么触发（某句话/某个细节）" },
      { "word": "缓缓开口", "replacement_hint": "用“说/问”+具体动作替代" },
      { "word": "缓缓说道", "replacement_hint": "用“说/问”+具体动作替代", "per_chapter_max": 1 },
      { "word": "微微一笑", "replacement_hint": "写清楚笑的方式和原因", "per_chapter_max": 1 },
      { "word": "淡淡一笑", "replacement_hint": "写清楚笑的方式和原因" },
      { "word": "轻轻一笑", "replacement_hint": "写清楚笑的方式和原因" },
      { "word": "轻轻叹了口气", "replacement_hint": "减少模板动作，写叹气的原因与后续动作" },
      { "word": "长长地舒了口气", "replacement_hint": "减少模板动作，写呼吸变化与身体反应" },
      { "word": "脚步一顿", "replacement_hint": "每章限频，用更具体动作替代", "per_chapter_max": 1 },
      { "word": "身形一滞", "replacement_hint": "每章限频，用更具体动作替代", "per_chapter_max": 1 },
      { "word": "不由自主地", "replacement_hint": "删除，直接写动作" },
      { "word": "下意识地", "replacement_hint": "删除，直接写动作" },
      { "word": "下意识地后退", "replacement_hint": "改成更具体的动作链（脚尖一撤/肩膀一缩）" },
      { "word": "忍不住", "replacement_hint": "删除，直接写动作" },
      { "word": "忍不住地笑", "replacement_hint": "写清楚笑的方式与触发点" },
      { "word": "忍不住地皱眉", "replacement_hint": "写清楚触发点与更具体的表情/动作" },
      { "word": "伸手揉了揉眉心", "replacement_hint": "减少模板动作，写出疲惫/烦躁的具体原因" },
      { "word": "抬手擦了擦冷汗", "replacement_hint": "减少模板动作，写出紧张的具体原因" },
      { "word": "缓缓抬起头", "replacement_hint": "减少“缓缓”套话，用更具体动作与节奏替代" },
      { "word": "缓缓转身", "replacement_hint": "减少“缓缓”套话，用更具体动作与节奏替代" },
      { "word": "缓缓伸出手", "replacement_hint": "减少“缓缓”套话，用更具体动作与节奏替代" }
    ],
    "abstract_filler": [
      { "word": "某种程度上", "replacement_hint": "删除抽象缓冲语，直接说结论" },
      { "word": "某种意义上", "replacement_hint": "删除抽象缓冲语，直接说结论" },
      { "word": "难以形容", "replacement_hint": "努力去形容：给出具体感官细节" },
      { "word": "无法言喻", "replacement_hint": "努力去形容：给出具体感官细节" },
      { "word": "不可名状", "replacement_hint": "努力去形容：给出具体感官细节" },
      { "word": "说不清道不明", "replacement_hint": "写出能说清的部分（至少 2-3 个具体点）" },
      { "word": "难以言喻", "replacement_hint": "努力去形容：给出具体感官细节" },
      { "word": "无法用言语形容", "replacement_hint": "努力去形容：给出具体感官细节" },
      { "word": "让人难以置信", "replacement_hint": "用具体动作/反应代替抽象评价" },
      { "word": "不可思议", "replacement_hint": "用具体动作/反应代替抽象评价" },
      { "word": "难以想象", "replacement_hint": "用具体画面/数据/对比代替抽象评价" },
      { "word": "各种各样", "replacement_hint": "举 2-3 个具体例子，不要空泛概括" }
    ]
  },
  "category_metadata": {
    "enumeration_template": {
      "description": "编号式推进词易形成解释腔；其中“首先/其次/最后”类词条以限频为主"
    },
    "academic_tone": {
      "description": "学术腔词条整体应少用；“诸如/例如”属于频率敏感项，避免高密度解释腔"
    },
    "narration_connector": {
      "context": "narration_only",
      "description": "仅叙述文禁止，对话中允许；本类词条不进入 words 扁平列表"
    },
    "abstract_filler": {
      "description": "抽象空词：建议改为具体感官/事件/程度",
      "genre_override": {
        "sci-fi": {
          "description": "科幻场景允许有限度使用“难以形容/不可名状”（每章≤2 处），但仍应尽量给出具体描写",
          "per_chapter_max": { "难以形容": 2, "不可名状": 2 }
        }
      }
    }
  },
  "whitelist": [],
  "update_log": [
    {
      "date": "2026-03-05",
      "version": "2.0.0",
      "description": "扩展黑名单至 200+ 词（对齐 anti-ai-polish 10 类），新增 max_words/replacement_hint/per_chapter_max/category_metadata（narration_only/genre_override）。",
      "words_count": 221
    }
  ]
}
```
````

---

### 6.3 风格指纹模板

## 文件路径：`templates/style-profile-template.json`

````markdown
```json
{
  "_comment": "风格指纹模板 — 由 StyleAnalyzer Agent 填充，ChapterWriter 和 StyleRefiner 读取",

  "source_type": null,
  "_source_type_comment": "original（用户原创样本）| reference（参考作者）| template（预置模板）| write_then_extract（先写后提）",

  "reference_author": null,
  "_reference_author_comment": "仿写模式时填写参考作者名，原创模式为 null",

  "avg_sentence_length": null,
  "_avg_sentence_length_comment": "平均句长（字数），如 18 表示平均每句 18 字",

  "sentence_length_range": [null, null],
  "_sentence_length_range_comment": "[最短句, 最长句]，如 [8, 35]",

  "sentence_length_std_dev": null,
  "_sentence_length_std_dev_comment": "句长标准差（字）。经验阈值：人类范围 8-18；AI 特征：< 6（过于均匀，待后续语料校准）",

  "paragraph_length_cv": null,
  "_paragraph_length_cv_comment": "段落长度变异系数（Coefficient of Variation）。经验阈值：人类范围 0.4-1.2；AI 特征：< 0.3（过于均匀，待后续语料校准）",

  "emotional_volatility": null,
  "_emotional_volatility_comment": "情感波动性（high|medium|low）。表示段落之间情绪起伏与反差程度；AI 生成文本通常偏 low",

  "register_mixing": null,
  "_register_mixing_comment": "语域混合程度（high|medium|low）。表示书面语/口语/方言/行话等混用程度；AI 生成文本通常偏 low",

  "vocabulary_richness": null,
  "_vocabulary_richness_comment": "词汇丰富度（high|medium|low）。表示词汇多样性、低重复率与低频词比例（hapax legomena）；AI 生成文本通常偏 low",

  "dialogue_ratio": null,
  "_dialogue_ratio_comment": "对话占全文比例，如 0.4 表示 40%",

  "description_ratio": null,
  "_description_ratio_comment": "描写（环境+心理）占比",

  "action_ratio": null,
  "_action_ratio_comment": "动作叙述占比",

  "rhetoric_preferences": [],
  "_rhetoric_preferences_comment": "修辞偏好列表，格式 [{\"type\": \"短句切换\", \"frequency\": \"high|medium|low\"}]",

  "forbidden_words": [],
  "_forbidden_words_comment": "作者从不使用的词汇列表（精准收录，不过度泛化）",

  "preferred_expressions": [],
  "_preferred_expressions_comment": "作者常用的特色表达",

  "character_speech_patterns": {},
  "_character_speech_patterns_comment": "角色语癖，格式 {\"角色名\": \"语癖描述 + 具体示例\"}",

  "paragraph_style": {
    "avg_paragraph_length": null,
    "dialogue_format": null
  },
  "_paragraph_style_comment": "avg_paragraph_length 为平均段落字数，dialogue_format 为 引号式 | 无引号式",

  "narrative_voice": null,
  "_narrative_voice_comment": "第一人称 | 第三人称限制 | 全知",

  "style_exemplars": [],
  "_style_exemplars_comment": "从样本中提取的 3-5 段最能代表目标风格质感的原文片段（每段 50-150 字）。ChapterWriter 写作前作为 few-shot 锚点阅读，StyleRefiner 润色时作为风格参照。预置模板模式填入该风格类型的典型范文片段",

  "writing_directives": [],
  "_writing_directives_comment": "正向写作指令数组，每条含 directive + do/dont 对比示例。格式：[{\"directive\": \"用短动作句推进\", \"do\": \"他拔刀。刀光一闪。人头落地。\", \"dont\": \"他迅速地拔出了腰间的长刀，在刀光闪烁之间，对方的头颅便已经滚落在地。\"}]。旧格式（纯字符串数组）仍兼容，但新提取应使用 DO/DON'T 格式",

  "override_constraints": {},
  "_override_constraints_comment": "可选：覆盖 ChapterWriter 默认写作约束。支持的 key：anti_intuitive_detail (bool, 默认 true), max_scene_sentences (int, 默认 2)。未设置的 key 使用默认值",

  "analysis_notes": null,
  "_analysis_notes_comment": "StyleAnalyzer 的分析备注"
}
```
````
