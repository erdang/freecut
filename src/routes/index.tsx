import { createFileRoute, Link } from '@tanstack/react-router';
import { Layers, ArrowRight, Play, FolderOpen, Download, Star, ExternalLink } from 'lucide-react';
import { FreeCutLogo } from '@/components/brand/freecut-logo';
import { Button } from '@/components/ui/button';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion';

export const Route = createFileRoute('/')({
  component: LandingPage,
});

const faqItems = [
  {
    question: 'FreeCut 真的是免费的吗？',
    answer: '是的，FreeCut 完全免费，并且基于 MIT 协议开源，没有隐藏收费、订阅，也不会添加水印。',
  },
  {
    question: '需要安装什么吗？',
    answer: '不需要安装。FreeCut 完全运行在浏览器中，打开网页就能开始剪辑。',
  },
  {
    question: '我的视频存在哪里？',
    answer: '你的视频和项目默认保存在本地浏览器环境中，或通过现代文件系统 API 直接引用你的本地文件。',
  },
  {
    id: 'browser-support',
    question: '支持哪些浏览器？',
    answer: (
      <>
        <p className="mb-3">
          FreeCut 目前在 Chrome 或 Edge 113+ 上体验最好。它依赖 WebGPU、
          WebCodecs、OPFS 和 File System Access 等现代浏览器能力，
          所以当前完整工作流优先面向 Chromium 内核浏览器。
        </p>
        <p>
          <strong>Brave 用户：</strong>File System Access API 默认关闭。请访问{' '}
          <code className="rounded bg-muted px-1 py-0.5 text-xs">
            brave://flags/#file-system-access-api
          </code>
          ，将其设置为 <strong>Enabled</strong>，然后重启浏览器。
        </p>
      </>
    ),
  },
  {
    question: '支持导出哪些格式？',
    answer: '视频支持 MP4、MOV、WebM、MKV；音频支持 MP3、AAC、WAV（PCM）。当前导出界面可选择 H.264、H.265、VP8、VP9 和 AV1，并提供低、中、高、超高画质预设。',
  },
  {
    question: '后续会继续改进什么？',
    answer: '当前重点仍然是 Beta 阶段的稳定性打磨，包括文档与实际功能对齐、提升可访问性与测试覆盖率，并让 FPS、吸附、预览质量、导出设置等默认值更好地贯穿整个编辑器。',
  },
  {
    question: '特别感谢',
    answer: (
      <>
        <p className="mb-3">
          特别感谢{' '}
          <a href="https://mediabunny.dev/" target="_blank" rel="noopener noreferrer" className="text-primary underline hover:text-primary/80">
            Mediabunny
          </a>{' '}
          让浏览器端视频编码变得如此简单。没有他们的出色工作，这个项目就不会存在。
        </p>
        <p className="mb-2 font-medium text-foreground">技术栈：</p>
        <ul className="list-disc pl-5 space-y-1">
          <li>React</li>
          <li>TypeScript</li>
          <li>Vite</li>
          <li>Shadcn</li>
        </ul>
      </>
    ),
  },
];

const showcaseItems = [
  {
    id: 'timeline',
    title: '时间线剪辑',
    description: '支持视频、音频、文字和图形的多轨道编辑',
    icon: Layers,
    media: '/assets/landing/timeline.png',
    className: 'md:col-span-2 md:row-span-1',
    aspectClass: 'aspect-[2/1]',
  },
  {
    id: 'keyframe',
    title: '简洁关键帧编辑',
    description: '用直观的关键帧动画做出流畅转场和动效',
    icon: Play,
    media: '/assets/landing/keyframe.png',
    className: 'md:row-span-2',
    aspectClass: 'aspect-[3/4] md:aspect-auto md:h-full',
  },
  {
    id: 'projects',
    title: '项目管理',
    description: '创建、整理并统一管理你的剪辑项目',
    icon: FolderOpen,
    media: '/assets/landing/projects.png',
    className: '',
    aspectClass: 'aspect-video',
  },
  {
    id: 'export',
    title: '网页端导出',
    description: '直接在浏览器本地渲染并导出视频。',
    icon: Download,
    media: '/assets/landing/export.png',
    className: '',
    aspectClass: 'aspect-video',
  },
];

function LandingPage() {
  return (
    <div className="min-h-screen bg-background text-foreground select-text">
      {/* Hero Section */}
      <section className="relative flex min-h-[60vh] flex-col items-center justify-center px-6 py-12">
        {/* Subtle gradient background */}
        <div className="pointer-events-none absolute inset-0 overflow-hidden">
          <div className="absolute left-1/2 top-1/2 h-[600px] w-[600px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-primary/5 blur-3xl" />
        </div>

        <div className="relative z-10 flex flex-col items-center text-center animate-fade-in">
          <div className="mb-6 flex items-center gap-3">
            <FreeCutLogo size="lg" />
            <span className="rounded-full bg-primary/15 px-3 py-1 text-xs font-medium text-primary">
              测试版
            </span>
          </div>

          <h1 className="mb-4 max-w-2xl text-4xl font-bold tracking-tight sm:text-5xl md:text-6xl">
            浏览器里，{' '}
            <span className="text-primary">直接剪视频。</span>
          </h1>

          <p className="mb-6 max-w-lg text-lg text-muted-foreground sm:text-xl">
            专业级视频编辑，零安装。
            在浏览器里就能完成内容创作。
          </p>

          <p className="mb-6 max-w-lg text-sm text-amber-600 dark:text-amber-500">
            当前仍处于 Beta 阶段，部分功能可能还不够稳定，但已经可以开始体验完整流程。  
          </p>

          <div className="flex flex-col items-center gap-4 sm:flex-row">
            <Button asChild size="lg" className="gap-2 px-8">
              <Link to="/projects">
                立即开始
                <ArrowRight className="h-4 w-4" />
              </Link>
            </Button>

            <Button asChild variant="outline" size="lg" className="gap-2">
              <a
                href="https://github.com/walterlow/freecut"
                target="_blank"
                rel="noopener noreferrer"
              >
                <Star className="h-4 w-4" />
                在 GitHub 点个 Star
              </a>
            </Button>
          </div>
        </div>
      </section>

      {/* Showcase Bento Grid */}
      <section className="border-t border-border px-6 py-20">
        <div className="mx-auto max-w-6xl">
          <div className="mb-12 text-center">
            <h2 className="mb-4 text-3xl font-bold tracking-tight sm:text-4xl">
              核心剪辑能力
            </h2>
            <p className="mx-auto max-w-2xl text-muted-foreground">
              一套完整的视频编辑工具，直接运行在你的浏览器里。
            </p>
          </div>

          <div className="grid gap-4 md:grid-cols-3 md:grid-rows-2">
            {showcaseItems.map((item) => (
              <div
                key={item.id}
                className={`group relative overflow-hidden rounded-xl border border-border bg-card transition-all hover:border-primary/50 hover:shadow-lg hover:shadow-primary/5 ${item.className}`}
              >
                {/* Media placeholder or actual media */}
                <div className={`relative ${item.aspectClass} w-full overflow-hidden bg-muted`}>
                  {item.media ? (
                    <img
                      src={item.media}
                      alt={item.title}
                      className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
                    />
                  ) : (
                    /* Placeholder with icon */
                    <div className="absolute inset-0 flex items-center justify-center">
                      <div className="flex flex-col items-center gap-3 text-muted-foreground/50">
                        <item.icon className="h-12 w-12" />
                        <span className="text-xs uppercase tracking-wider">预览图</span>
                      </div>
                      {/* Subtle grid pattern */}
                      <div
                        className="absolute inset-0 opacity-[0.03]"
                        style={{
                          backgroundImage: `linear-gradient(to right, currentColor 1px, transparent 1px),
                                           linear-gradient(to bottom, currentColor 1px, transparent 1px)`,
                          backgroundSize: '24px 24px',
                        }}
                      />
                    </div>
                  )}
                </div>

                {/* Content overlay */}
                <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-card via-card/95 to-transparent p-4 pt-8">
                  <div className="flex items-center gap-2">
                    <div className="flex h-8 w-8 items-center justify-center rounded-md bg-primary/10">
                      <item.icon className="h-4 w-4 text-primary" />
                    </div>
                    <div>
                      <h3 className="font-semibold">{item.title}</h3>
                      <p className="text-xs text-muted-foreground">{item.description}</p>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Demo Video Section */}
      <section className="border-t border-border px-6 py-20">
        <div className="mx-auto max-w-4xl">
          <div className="mb-10 text-center">
            <h2 className="mb-4 text-3xl font-bold tracking-tight sm:text-4xl">
              看看实际效果
            </h2>
            <p className="mx-auto max-w-2xl text-muted-foreground">
              通过一个简短演示快速了解 FreeCut 的剪辑能力。
            </p>
          </div>

          <a
            href="https://www.youtube.com/watch?v=2EWVUXpNntk"
            target="_blank"
            rel="noopener noreferrer"
            className="group block overflow-hidden rounded-xl border border-border bg-card shadow-lg transition-colors hover:border-primary/50"
          >
            <div className="relative aspect-video w-full overflow-hidden bg-muted">
              <img
                src="/assets/landing/timeline.png"
                alt="FreeCut 演示预览"
                className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
              />
              <div className="absolute inset-0 bg-black/30 transition-colors group-hover:bg-black/20" />
              <div className="absolute inset-0 flex items-center justify-center">
                <div className="flex h-20 w-20 items-center justify-center rounded-full border border-white/30 bg-black/55 text-white shadow-2xl backdrop-blur-sm">
                  <Play className="ml-1 h-8 w-8 fill-current" />
                </div>
              </div>
              <div className="absolute bottom-4 left-4 flex items-center gap-2 rounded-full border border-white/20 bg-black/60 px-3 py-1.5 text-sm text-white backdrop-blur-sm">
                <span>在 YouTube 观看演示</span>
                <ExternalLink className="h-3.5 w-3.5" />
              </div>
            </div>
          </a>
        </div>
      </section>

      {/* FAQ Section */}
      <section className="border-t border-border bg-card/50 px-6 py-20">
        <div className="mx-auto max-w-3xl">
          <div className="mb-10 text-center">
            <h2 className="mb-4 text-3xl font-bold tracking-tight sm:text-4xl">
              常见问题
            </h2>
            <p className="text-muted-foreground">
              关于 FreeCut，你需要了解的都在这里。
            </p>
          </div>

          <Accordion type="single" collapsible className="w-full">
            {faqItems.map((item, index) => (
              <AccordionItem key={index} value={`item-${index}`} id={item.id}>
                <AccordionTrigger className="text-left">
                  {item.question}
                </AccordionTrigger>
                <AccordionContent className="text-muted-foreground">
                  {item.answer}
                </AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
        </div>
      </section>

      {/* CTA Footer Section */}
      <section className="border-t border-border px-6 py-20">
        <div className="mx-auto flex max-w-2xl flex-col items-center text-center">
          <h2 className="mb-4 text-2xl font-bold sm:text-3xl">
            准备开始剪辑了吗？
          </h2>
          <p className="mb-8 text-muted-foreground">
            几秒钟内就能创建你的第一个项目。
          </p>
          <div className="flex flex-col items-center gap-4 sm:flex-row">
            <Button asChild size="lg" className="gap-2 px-8">
              <Link to="/projects">
                开始剪辑
                <ArrowRight className="h-4 w-4" />
              </Link>
            </Button>

            <Button asChild variant="outline" size="lg" className="gap-2">
              <a
                href="https://github.com/walterlow/freecut"
                target="_blank"
                rel="noopener noreferrer"
              >
                <Star className="h-4 w-4" />
                在 GitHub 点个 Star
              </a>
            </Button>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-border px-6 py-8">
        <div className="mx-auto max-w-5xl text-center text-sm text-muted-foreground">
          MIT 许可证 © {new Date().getFullYear()} FreeCut
        </div>
      </footer>
    </div>
  );
}
