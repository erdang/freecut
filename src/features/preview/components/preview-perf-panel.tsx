import { memo } from 'react';
import {
  PREVIEW_PERF_PANEL_QUERY_KEY,
  type PreviewPerfSnapshot,
} from '../utils/preview-constants';

interface PreviewPerfPanelProps {
  snapshot: PreviewPerfSnapshot;
  latestRenderSourceSwitch: PreviewPerfSnapshot['renderSourceHistory'][number] | null;
}

function formatRenderSource(source: string) {
  return source === 'fast_scrub_overlay'
    ? '叠加层'
    : source === 'playback_transition_overlay'
      ? '转场'
      : '播放器';
}

export const PreviewPerfPanel = memo(function PreviewPerfPanel({
  snapshot,
  latestRenderSourceSwitch,
}: PreviewPerfPanelProps) {
  const srcLabel = formatRenderSource(snapshot.renderSource);
  const srcColor = snapshot.renderSource === 'player' ? '#4ade80' : '#60a5fa';
  const seekOk = snapshot.seekLatencyAvgMs < 50;
  const qualOk = snapshot.effectivePreviewQuality >= snapshot.userPreviewQuality;
  const frameOk = snapshot.frameTimeEmaMs <= snapshot.frameTimeBudgetMs * 1.2;
  const transitionActive = snapshot.transitionSessionActive;
  const transitionMode = snapshot.transitionSessionMode === 'none'
    ? null
    : snapshot.transitionSessionMode === 'dom'
      ? 'DOM'
      : '画布';

  return (
    <div
      className="absolute right-2 bottom-2 z-30 bg-black/80 text-white/90 rounded-md text-[10px] leading-[14px] font-mono pointer-events-none select-none backdrop-blur-sm"
      style={{ padding: '6px 8px', minWidth: 180 }}
      data-testid="preview-perf-panel"
      title={`切换：Alt+Shift+P | URL 参数：?${PREVIEW_PERF_PANEL_QUERY_KEY}=1`}
    >
      <div style={{ marginBottom: 3 }}>
        <span style={{ color: srcColor }}>{srcLabel}</span>
        {snapshot.staleScrubOverlayDrops > 0 && (
          <span style={{ color: '#f87171' }}> {snapshot.staleScrubOverlayDrops} 过期</span>
        )}
        {latestRenderSourceSwitch && (
          <span style={{ color: '#a1a1aa' }}>
            {' '}{formatRenderSource(latestRenderSourceSwitch.from)}{'\u2192'}
            {formatRenderSource(latestRenderSourceSwitch.to)} @{latestRenderSourceSwitch.atFrame}
          </span>
        )}
      </div>

      <div>
        <span style={{ color: seekOk ? '#a1a1aa' : '#fbbf24' }}>
          跳转 {snapshot.seekLatencyAvgMs.toFixed(0)}ms
        </span>
        {snapshot.seekLatencyTimeouts > 0 && (
          <span style={{ color: '#f87171' }}> {snapshot.seekLatencyTimeouts} 超时</span>
        )}
        {snapshot.scrubDroppedFrames > 0 && (
          <span style={{ color: '#fbbf24' }}>
            {' '}拖拽预览 {snapshot.scrubDroppedFrames}/{snapshot.scrubUpdates} 丢帧
          </span>
        )}
      </div>

      <div>
        <span style={{ color: qualOk ? '#a1a1aa' : '#fbbf24' }}>
          质量 {snapshot.effectivePreviewQuality}x
          {snapshot.effectivePreviewQuality < snapshot.userPreviewQuality
            && `（上限 ${snapshot.adaptiveQualityCap}x）`}
        </span>
        {' '}
        <span style={{ color: frameOk ? '#a1a1aa' : '#f87171' }}>
          {snapshot.frameTimeEmaMs.toFixed(0)}/{snapshot.frameTimeBudgetMs.toFixed(0)}ms
        </span>
        {(snapshot.adaptiveQualityDowngrades > 0 || snapshot.adaptiveQualityRecovers > 0) && (
          <span style={{ color: '#a1a1aa' }}>
            {' '}{'\u2193'}{snapshot.adaptiveQualityDowngrades} {'\u2191'}{snapshot.adaptiveQualityRecovers}
          </span>
        )}
      </div>

      <div style={{ color: '#a1a1aa' }}>
        资源池 {snapshot.sourceWarmKeep}/{snapshot.sourceWarmTarget}
        {' '}({snapshot.sourcePoolSources}src {snapshot.sourcePoolElements}el)
        {snapshot.sourceWarmEvictions > 0 && (
          <span style={{ color: '#fbbf24' }}> {snapshot.sourceWarmEvictions} 淘汰</span>
        )}
      </div>

      {(snapshot.preseekRequests > 0 || snapshot.preseekCachedBitmaps > 0) && (
        <div style={{ color: '#a1a1aa' }}>
          预寻帧 {snapshot.preseekCacheHits + snapshot.preseekInflightReuses}/{snapshot.preseekRequests} 命中
          {' '}投递 {snapshot.preseekWorkerSuccesses}/{snapshot.preseekWorkerPosts}
          {' '}缓存 {snapshot.preseekCachedBitmaps}
          {snapshot.preseekWaitMatches > 0 && (
            <span>
              {' '}等待 {snapshot.preseekWaitResolved}/{snapshot.preseekWaitMatches}
            </span>
          )}
          {snapshot.preseekWorkerFailures > 0 && (
            <span style={{ color: '#fbbf24' }}> {snapshot.preseekWorkerFailures} 失败</span>
          )}
          {snapshot.preseekWaitTimeouts > 0 && (
            <span style={{ color: '#fbbf24' }}> {snapshot.preseekWaitTimeouts} 超时</span>
          )}
        </div>
      )}

      {(snapshot.unresolvedQueue > 0 || snapshot.pendingResolves > 0) && (
        <div style={{ color: '#fbbf24' }}>
          解析中：{snapshot.pendingResolves} 个进行中，{snapshot.unresolvedQueue} 个排队
          {' '}（平均 {snapshot.resolveAvgMs.toFixed(0)}ms）
        </div>
      )}

      {(transitionActive || snapshot.transitionSessionCount > 0) && (
        <div style={{ borderTop: '1px solid rgba(255,255,255,0.1)', marginTop: 3, paddingTop: 3 }}>
          <div>
            <span style={{ color: transitionActive ? '#60a5fa' : '#a1a1aa' }}>
              {transitionActive ? `转场 ${transitionMode}` : '最近转场'}
              {snapshot.transitionSessionComplex ? '（复杂）' : ''}
            </span>
            {transitionActive && (
              <span style={{ color: '#a1a1aa' }}>
                {' '}{snapshot.transitionSessionStartFrame}{'\u2192'}{snapshot.transitionSessionEndFrame}
                {' '}buf:{snapshot.transitionBufferedFrames}
              </span>
            )}
          </div>
          {snapshot.transitionLastPrepareMs > 0 && (
            <div style={{ color: snapshot.transitionLastEntryMisses > 0 ? '#f87171' : '#a1a1aa' }}>
              准备 {snapshot.transitionLastPrepareMs.toFixed(0)}ms
              {snapshot.transitionLastReadyLeadMs > 0
                && ` 提前 ${snapshot.transitionLastReadyLeadMs.toFixed(0)}ms`}
              {snapshot.transitionLastEntryMisses > 0 && ` ${snapshot.transitionLastEntryMisses} 次未命中`}
              <span style={{ color: '#a1a1aa' }}> #{snapshot.transitionSessionCount}</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
});
