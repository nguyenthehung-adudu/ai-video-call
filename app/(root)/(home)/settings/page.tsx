"use client";

import { useState, useEffect } from "react";
import { useUser } from "@clerk/nextjs";
import { useToast } from "@/components/ui/use-toast";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
import { Save, Settings, Languages, Brain } from "lucide-react";

interface AISettings {
  // Translation
  enableTranslation: boolean;
  targetLanguage: string; // Đích ngôn ngữ
  sourceLanguage?: string; // Ngôn ngữ nguồn (ví dụ: 'vi', 'en')
  translateService?: 'mymemory' | 'openai' | 'deepl';
  showOriginal?: boolean; // Hiển thị sub gốc

  // Advanced
  chunkIntervalMs: number;
  maxBufferSeconds: number;
  volumeThreshold: number;
  minSpeechDurationMs: number;
  silenceTimeoutMs: number;
}

const LANGUAGES = [
  { code: 'vi', name: 'Tiếng Việt' },
  { code: 'en', name: 'Tiếng Anh' },
  { code: 'zh', name: 'Tiếng Trung' },
  { code: 'ja', name: 'Tiếng Nhật' },
  { code: 'ko', name: 'Tiếng Hàn' },
  { code: 'fr', name: 'Tiếng Pháp' },
  { code: 'de', name: 'Tiếng Đức' },
  { code: 'es', name: 'Tiếng Tây Ban Nha' },
] as const;

const TRANSLATE_SERVICES = [
  { value: 'mymemory', label: 'MyMemory (Free)' },
  { value: 'openai', label: 'OpenAI GPT (Requires API Key)' },
  { value: 'deepl', label: 'DeepL (Requires API Key)' },
] as const;

const DEFAULT_SETTINGS: AISettings = {
  enableTranslation: true,
  targetLanguage: 'vi',
  sourceLanguage: 'en',
  translateService: 'mymemory',
  showOriginal: true,
  chunkIntervalMs: 2000,
  maxBufferSeconds: 15,
  volumeThreshold: 0.035,
  minSpeechDurationMs: 300,
  silenceTimeoutMs: 1200,
};

const SETTINGS_KEY = 'ai-meeting-settings';

export default function AISettingsPage() {
  const { user, isLoaded } = useUser();
  const { toast } = useToast();

  const [settings, setSettings] = useState<AISettings>(DEFAULT_SETTINGS);
  const [isSaving, setIsSaving] = useState(false);
  const [hasChanges, setHasChanges] = useState(false);

  // Load settings on mount
  useEffect(() => {
    const saved = localStorage.getItem(SETTINGS_KEY);
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        setSettings({ ...DEFAULT_SETTINGS, ...parsed });
      } catch (e) {
        console.error('Failed to parse settings:', e);
      }
    }
  }, []);

  // Detect if changes
  useEffect(() => {
    const saved = localStorage.getItem(SETTINGS_KEY);
    if (saved) {
      const parsed = JSON.parse(saved);
      setHasChanges(JSON.stringify(settings) !== JSON.stringify({ ...DEFAULT_SETTINGS, ...parsed }));
    } else {
      setHasChanges(JSON.stringify(settings) !== JSON.stringify(DEFAULT_SETTINGS));
    }
  }, [settings]);

  const updateSetting = <K extends keyof AISettings>(key: K, value: AISettings[K]) => {
    setSettings(prev => ({ ...prev, [key]: value }));
  };

  const saveSettings = async () => {
    setIsSaving(true);
    try {
      // Save to localStorage
      localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));

      toast({
        title: "Đã lưu cài đặt!",
        description: "Các thiết lập AI đã được cập nhật.",
        duration: 3000,
      });
      setHasChanges(false);
    } catch (error) {
      toast({
        title: "Lỗi lưu cài đặt",
        description: "Vui lòng thử lại.",
        variant: "destructive",
      });
    } finally {
      setIsSaving(false);
    }
  };

  const resetSettings = () => {
    setSettings(DEFAULT_SETTINGS);
    toast({
      title: "Đã đặt lại mặc định",
      description: "Cài đặt về giá trị mặc định.",
    });
  };

  if (!isLoaded) {
    return <div className="flex items-center justify-center size-full"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-1"></div></div>;
  }

  return (
    <div className="flex size-full flex-col gap-6 p-4 lg:p-8 text-white overflow-y-auto">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <div className="rounded-xl bg-gradient-to-br from-blue-1/20 to-purple-1/20 p-3">
            <Settings className="h-6 w-6 text-blue-1" />
          </div>
          <div>
            <h1 className="text-2xl font-bold">Cài đặt AI</h1>
            <p className="text-sm text-gray-400">
              Cấu hình dịch thuật
            </p>
          </div>
        </div>

        <div className="flex gap-3">
          <Button variant="outline" onClick={resetSettings} disabled={isSaving}>
            Đặt lại mặc định
          </Button>
          <Button onClick={saveSettings} disabled={isSaving || !hasChanges}>
            {isSaving ? (
              <>
                <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                Đang lưu...
              </>
            ) : (
              <>
                <Save className="h-4 w-4 mr-2" />
                Lưu thay đổi
              </>
            )}
          </Button>
        </div>
      </div>

      <Separator />

      {/* Settings Grid */}
      <div className="grid gap-6 lg:grid-cols-2">
        {/* Card 1: Translation */}
        <Card className="bg-dark-2/50 border-dark-3 lg:col-span-2">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-white">
              <Languages className="h-5 w-5 text-green-400 " />
              Translation
            </CardTitle>
            <CardDescription className="text-gray-400">
              Dịch phụ đề sang ngôn ngữ khác
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            {/* Enable Translation */}
            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <Label className="text-base text-white !important">Bật Dịch thuật</Label>
                <p className="text-xs text-gray-400">
                  Tự động dịch phụ đề sang ngôn ngữ đích
                </p>
              </div>
              <Switch
                checked={settings.enableTranslation}
                onCheckedChange={(checked) => updateSetting('enableTranslation', checked)}
              />
            </div>

            <Separator />

            {/* Target Language */}
            <div className="space-y-2">
              <Label className="text-base text-white !important">Ngôn ngữ dịch</Label>
              <p className="text-xs text-gray-400 mb-3">
                Dịch sang ngôn ngữ này (bạn có thể đọc)
              </p>
              <Select
                value={settings.targetLanguage}
                onValueChange={(value) => updateSetting('targetLanguage', value)}
                disabled={!settings.enableTranslation}
              >
                <SelectTrigger className="bg-dark-3 border-dark-3">
                  <SelectValue placeholder="Chọn ngôn ngữ dịch" />
                </SelectTrigger>
                <SelectContent>
                  {LANGUAGES.map((lang) => (
                    <SelectItem key={lang.code} value={lang.code}>
                      {lang.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <Separator />

            {/* Source Language */}
            <div className="space-y-2">
              <Label className="text-base text-white !important">Ngôn ngữ nguồn</Label>
              <p className="text-xs text-gray-400 mb-3">
                Ngôn ngữ bạn sẽ nói (Whisper sẽ nhận diện ngôn ngữ này)
              </p>
              <Select
                value={settings.sourceLanguage || 'auto'}
                onValueChange={(value) => updateSetting('sourceLanguage', value === 'auto' ? undefined : value)}
                disabled={!settings.enableTranslation}
              >
                <SelectTrigger className="bg-dark-3 border-dark-3">
                  <SelectValue placeholder="Chọn ngôn ngữ nguồn" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="auto">Tự động (Auto-detect)</SelectItem>
                  {LANGUAGES.map((lang) => (
                    <SelectItem key={lang.code} value={lang.code}>
                      {lang.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <Separator />

            {/* Show Original Subtitles */}
            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <Label className="text-base text-white !important">Hiển thị sub gốc</Label>
                <p className="text-xs text-gray-400">
                  Hiển thị cả phụ đề gốc và bản dịch
                </p>
              </div>
              <Switch
                checked={settings.showOriginal}
                onCheckedChange={(checked) => updateSetting('showOriginal', checked)}
              />
            </div>

            <Separator />

            {/* Translate Service */}
            <div className="space-y-2">
              <Label className="text-base text-white !important">Dịch vụ dịch</Label>
              <p className="text-xs text-gray-400 mb-3">
                Chọn dịch vụ dịch thuật (MyMemory miễn phí, có giới hạn)
              </p>
              <Select
                value={settings.translateService}
                onValueChange={(value) => updateSetting('translateService', value as any)}
              >
                <SelectTrigger className="bg-dark-3 border-dark-3">
                  <SelectValue placeholder="Chọn dịch vụ" />
                </SelectTrigger>
                <SelectContent>
                  {TRANSLATE_SERVICES.map((service) => (
                    <SelectItem key={service.value} value={service.value}>
                      {service.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {settings.translateService === 'openai' && !process.env.NEXT_PUBLIC_OPENAI_API_KEY && (
                <p className="text-xs text-yellow-1 mt-2">
                  ⚠️ Chưa cấu hình OPENAI_API_KEY trong .env
                </p>
              )}
              {settings.translateService === 'deepl' && !process.env.NEXT_PUBLIC_DEEPL_API_KEY && (
                <p className="text-xs text-yellow-1 mt-2">
                  ⚠️ Chưa cấu hình DEEPL_API_KEY trong .env
                </p>
              )}
            </div>

            <div className="rounded-lg bg-blue-1/10 border border-blue-1/20 p-3">
              <p className="text-xs text-blue-200">
                <strong>Lưu ý:</strong> Hỗ trợ dịch giữa các ngôn ngữ: Việt, Anh, Trung, Nhật, Hàn, Pháp, Đức, Tây Ban Nha.
              </p>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
