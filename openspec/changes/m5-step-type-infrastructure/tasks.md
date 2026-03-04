# Tasks

## Phase 1: Type System Extension

- [ ] 定义 VolumeStep type（pipeline: 'volume', phase: 'outline' | 'validate' | 'commit'）(src/steps.ts)
- [ ] 定义 QuickStartStep type（pipeline: 'quickstart', phase: 'world' | 'characters' | 'style' | 'trial' | 'results'）(src/steps.ts)
- [ ] 定义 ReviewStep type（pipeline: 'review', phase: 'collect' | 'audit' | 'report' | 'cleanup' | 'transition'）(src/steps.ts)
- [ ] 扩展 Step union type 为 ChapterStep | VolumeStep | QuickStartStep | ReviewStep (src/steps.ts)
- [ ] 定义 OrchestratorState 7-value enum (src/steps.ts)

## Phase 2: Checkpoint Upgrade

- [ ] 将 orchestrator_state 从 optional string 改为 required OrchestratorState (src/checkpoint.ts)
- [ ] 实现 inferLegacyState() 函数：根据现有 checkpoint 字段推断 state (src/checkpoint.ts)
- [ ] 在 checkpoint 解析时自动注入 legacy inference 结果 (src/checkpoint.ts)

## Phase 3: Next-Step Routing

- [ ] 重构 computeNextStep() 为 switch-on-state routing (src/next-step.ts)
- [ ] WRITING / CHAPTER_REWRITE 分支保持现有章节逻辑 (src/next-step.ts)
- [ ] QUICK_START / VOL_PLANNING / VOL_REVIEW 分支添加 placeholder（抛 NotImplemented）(src/next-step.ts)
- [ ] INIT 分支路由到 quickstart.world (src/next-step.ts)
- [ ] ERROR_RETRY 分支实现基础重试逻辑 (src/next-step.ts)

## Phase 4: CLI Adaptation

- [ ] 适配 CLI 命令输出以显示新 step type 和 state (src/cli.ts)
- [ ] `novel status` 输出增加 orchestrator_state 显示 (src/cli.ts)

## Phase 5: Verification

- [ ] 验证旧 checkpoint（无 orchestrator_state）可正常解析并推断 state
- [ ] 验证现有章节流水线路径行为不变
- [ ] 验证新 state 的 placeholder 分支返回正确错误信息

## References

- `openspec/changes/m5-step-type-infrastructure/proposal.md`
- `openspec/changes/m5-step-type-infrastructure/design.md`
