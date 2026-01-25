/**
 * Crucible Community Edition
 * Copyright (C) 2025 Roundtable Labs Pty Ltd
 * 
 * Licensed under Apache License 2.0. See LICENSE file for details.
 */

"use client";

import { useEffect, useState, useCallback, useMemo, useRef, type FormEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Loader2,
  Eye,
  EyeOff,
  Save,
  X as XIcon,
  Plus,
  CheckCircle2,
  Search,
  Settings2,
  Key,
  Cpu,
  Menu,
  X as CloseIcon,
  Trash2,
  AlertCircle,
  CheckCircle,
  Info,
  Check,
  Minus,
  Shield
} from "lucide-react";
import { useAuth } from "@/components/providers/AuthProvider";
import { apiGet, apiPut, apiPost, apiPatch, apiDelete } from "@/lib/api/client";
import { GlassCard } from "@/components/ui/glass-card";
import { logError } from "@/lib/utils/errorHandler";
import { Tooltip } from "@/components/ui/tooltip";
import { HelpCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import { motion, AnimatePresence } from "framer-motion";
import { useToast } from "@/components/common/ToastProvider";

type ProviderApiKeys = {
  [provider: string]: string;
};

type UserSettings = {
  marketingOptIn: boolean;
  artifactRetention: boolean;
  retentionDays: number;
  excludedModelProviders: string[];
  providerApiKeys: ProviderApiKeys;
  defaultProvider: string;
};

type UserModel = {
  id: string;
  provider: string;
  api_identifier: string;
  display_name: string;
  description: string | null;
  enabled: boolean;
  metadata: Record<string, unknown> | null;
};

type DefaultModel = {
  id: string;
  display_name: string;
  provider: string;
  api_identifier: string;
  description: string | null;
  user_id?: string | null;  // null = seeded; set when user adds (only that user can remove)
};

// All providers (for API Keys section - includes aggregators)
const PROVIDERS = [
  { id: "openrouter", name: "openrouter", description: "Access to multiple models via OpenRouter" },
  { id: "eden_ai", name: "eden ai", description: "Multi-provider AI platform" },
  { id: "anthropic", name: "anthropic", description: "Claude models (Claude 3, etc.)" },
  { id: "openai", name: "openai", description: "GPT models (GPT-4, GPT-3.5, etc.)" },
  { id: "deepseek", name: "deepseek", description: "DeepSeek models" },
  { id: "google", name: "google", description: "Gemini models" },
  { id: "xai", name: "xai", description: "Grok models" },
];

// Providers for Add Model (excludes aggregators - users shouldn't manually add models with aggregator as provider)
const MODEL_PROVIDERS = PROVIDERS.filter((p) => p.id !== "openrouter" && p.id !== "eden_ai");

type SettingsSection = "api-keys" | "models" | "add-model";

const SETTINGS_SECTIONS: Array<{ id: SettingsSection; label: string; icon: typeof Key; description: string }> = [
  { id: "api-keys", label: "API Keys", icon: Key, description: "Manage provider API keys" },
  { id: "models", label: "Models", icon: Cpu, description: "Browse and manage LLM models" },
  { id: "add-model", label: "Add Model", icon: Plus, description: "Add a model to your list" },
];

export default function SettingsPage() {
  const { user, token } = useAuth();
  const queryClient = useQueryClient();
  const [activeSection, setActiveSection] = useState<SettingsSection>("api-keys");
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [showKeys, setShowKeys] = useState<{ [key: string]: boolean }>({});
  const [apiKeys, setApiKeys] = useState<ProviderApiKeys>({});
  const [savedApiKeys, setSavedApiKeys] = useState<ProviderApiKeys>({}); // Track saved keys
  const [revealedKeys, setRevealedKeys] = useState<{ [key: string]: string }>({}); // Store revealed key values separately
  const [isSaving, setIsSaving] = useState(false);
  const [savingProvider, setSavingProvider] = useState<string | null>(null); // Track which provider is being saved
  const { showToast } = useToast();
  const [modelSearch, setModelSearch] = useState("");
  // Track loading state for key fetching
  const [loadingKeys, setLoadingKeys] = useState<{ [key: string]: boolean }>({});

  // Prevent page jump on navigation - ensure page starts at top
  useEffect(() => {
    if (typeof window !== "undefined") {
      // Prevent browser scroll restoration
      if ("scrollRestoration" in window.history) {
        window.history.scrollRestoration = "manual";
      }
      // Scroll to top immediately on mount
      window.scrollTo(0, 0);
      document.documentElement.scrollTop = 0;
      document.body.scrollTop = 0;
    }
  }, []); // Run once on mount

  // Helper to get auth token (from useAuth or localStorage)
  const getAuthToken = useCallback(() => {
    // Try localStorage if token from useAuth is not available
    if (typeof window !== "undefined") {
      return token || localStorage.getItem("auth_token");
    }
    return token;
  }, [token]);

  // Fetch user settings
  const { data: settings, isLoading } = useQuery<UserSettings>({
    queryKey: ["userSettings"],
    queryFn: async () => {
      const response = await apiGet<UserSettings>("/api/user/settings", { token: getAuthToken() });
      return response;
    },
    enabled: !!user,
  });

  // Fetch all models from llm_models (seeded + user-added; user_id null = seeded)
  const { data: allModels = [] } = useQuery<DefaultModel[]>({
    queryKey: ["defaultModels"],
    queryFn: async () => {
      const response = await apiGet<DefaultModel[]>("/api/models", { token: getAuthToken() });
      return response;
    },
    enabled: true,
  });

  // Seeded models (user_id null) for Models section "Default"
  const defaultModels = useMemo(() => allModels.filter((m) => !m.user_id), [allModels]);

  // Fetch user's models (from llm_models where user_id=current)
  const { data: userModels = [] } = useQuery<UserModel[]>({
    queryKey: ["userModels"],
    queryFn: async () => {
      const response = await apiGet<UserModel[]>("/api/user/models", { token: getAuthToken() });
      return response;
    },
    enabled: !!user,
  });

  // Initialize state from fetched settings
  useEffect(() => {
    if (settings) {
      const keys = settings.providerApiKeys || {};

      setApiKeys(keys);
      setSavedApiKeys(keys); // Track what's saved

      // Reset showKeys and revealedKeys state when settings reload (e.g. after save)
      // This ensures we don't show "masked" values as plain text and clears old revealed keys
      setShowKeys({});
      setRevealedKeys({});
    }
  }, [settings]);

  const toggleShowKey = async (provider: string) => {
    const currentlyShowing = showKeys[provider];

    // If we're hiding, just toggle off
    if (currentlyShowing) {
      setShowKeys((prev) => ({
        ...prev,
        [provider]: false,
      }));
      return;
    }

    // Only allow revealing if:
    // 1. There's a saved key for this provider
    // 2. The current key in apiKeys is masked (matches savedApiKeys)
    // 3. There are no unsaved changes
    const savedKey = savedApiKeys[provider];
    const currentKey = apiKeys[provider];
    
    if (!savedKey) {
      showToast({
        title: "No saved key",
        description: "Please save the API key first before revealing it.",
        variant: "error",
        duration: 3000,
      });
      return;
    }

    // Check if there are unsaved changes
    if (currentKey !== savedKey) {
      showToast({
        title: "Unsaved changes",
        description: "Please save or discard your changes before revealing the key.",
        variant: "error",
        duration: 3000,
      });
      return;
    }

    // Only allow revealing if the key is masked
    if (!isKeyMasked(currentKey)) {
      // Key is already unmasked (user is typing), just show it
      setShowKeys((prev) => ({
        ...prev,
        [provider]: true,
      }));
      return;
    }

    // Key is masked, fetch the real key
    if (loadingKeys[provider]) return; // Already fetching

    setLoadingKeys((prev) => ({ ...prev, [provider]: true }));

      try {
        const response = await apiGet<{ key: string }>(
          `/api/user/settings/provider-key/${provider}`,
          { token: getAuthToken() }
        );

        if (response?.key && typeof response.key === "string") {
          const unmaskedValue = response.key.trim();

          // Double-check: if the API returned a masked value, that means the stored key is corrupted
          // This can happen if a masked key was accidentally saved instead of the real key
          if (isKeyMasked(unmaskedValue)) {
            logError(
              new Error(`Backend returned masked key for ${provider}. This indicates the stored key may be corrupted.`),
              `Failed to reveal ${provider} API key`
            );
            showToast({
              title: `Error revealing ${provider} key`,
              description: "The stored key appears to be corrupted. Please delete and re-enter your API key.",
              variant: "error",
              duration: 5000,
            });
            return;
          }

          // Store the revealed key separately (don't update apiKeys)
          setRevealedKeys((prev) => ({
            ...prev,
            [provider]: unmaskedValue,
          }));

          // Then show it
          setShowKeys((prev) => ({
            ...prev,
            [provider]: true,
          }));
        } else {
          showToast({
            title: `Error revealing ${provider} key`,
            description: "No key data received from server.",
            variant: "error",
            duration: 5000,
          });
        }
      } catch (error) {
        logError(error, `Failed to fetch ${provider} API key`);
        const errorMessage = error instanceof Error ? error.message : "Unknown error";
        showToast({
          title: `Error revealing ${provider} key`,
          description: errorMessage.includes("404") 
            ? "API key not found. Please save your API key first."
            : "Failed to fetch the API key. Please try again.",
          variant: "error",
          duration: 5000,
        });
      } finally {
        setLoadingKeys((prev) => ({ ...prev, [provider]: false }));
      }
  };

  const handleApiKeyChange = useCallback((provider: string, value: string) => {
    setApiKeys((prev) => ({
      ...prev,
      [provider]: value,
    }));
    
    // Clear revealed key if user is typing (prevents showing stale revealed value)
    if (revealedKeys[provider] && value !== revealedKeys[provider]) {
      setRevealedKeys((prev) => {
        const updated = { ...prev };
        delete updated[provider];
        return updated;
      });
      // Also hide the key if it was showing
      setShowKeys((prev) => ({
        ...prev,
        [provider]: false,
      }));
    }
  }, [revealedKeys]);

  const saveSettings = useMutation({
    mutationFn: async (data: Partial<UserSettings>) => {
      const authToken = getAuthToken();

      return await apiPut<UserSettings>("/api/user/settings", {
        body: data,
        token: authToken || undefined, // Pass undefined if no token (API will get from cookies)
        credentials: "include"
      });
    },
    onSuccess: async () => {
      queryClient.invalidateQueries({ queryKey: ["userSettings"] });
      showToast({ title: "Settings saved successfully!", variant: "success", duration: 3000 });
    },
    onError: (error) => {
      logError(error, "Failed to save settings");
      const errorMessage = error instanceof Error ? error.message : "Failed to save settings. Please try again.";
      showToast({ title: "Error saving settings", description: errorMessage, variant: "error", duration: 5000 });
    },
  });

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setIsSaving(true);
    // Removed setSaveMessage - now using toast notifications

    try {
      // Include keys that were previously saved but are now empty (to delete them)
      // Also include all current apiKeys (even if empty, to delete previously saved keys)
      const keysToSave: Record<string, string> = { ...apiKeys };
      // Add any saved keys that are being deleted (exist in savedApiKeys but not in apiKeys or are empty)
      for (const provider in savedApiKeys) {
        if (!(provider in keysToSave) || keysToSave[provider] === "") {
          // Key was deleted - send empty string to delete it
          keysToSave[provider] = "";
        }
      }
      await saveSettings.mutateAsync({
        providerApiKeys: keysToSave,
      });
    } finally {
      setIsSaving(false);
    }
  };

  // Toggle model enable/disable
  const toggleModelMutation = useMutation({
    mutationFn: async ({ modelId, enabled }: { modelId: string; enabled: boolean }) => {
      return await apiPatch<UserModel>(`/api/user/models/${modelId}`, {
        body: { enabled },
        token: getAuthToken(),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["userModels"] });
    },
  });

  const handleToggleModel = useCallback((model: UserModel) => {
    toggleModelMutation.mutate({
      modelId: model.id,
      enabled: !model.enabled,
    });
  }, [toggleModelMutation]);

  // Delete a user-added model
  const deleteModelMutation = useMutation({
    mutationFn: async (modelId: string) => {
      const authToken = getAuthToken();
      if (!authToken) {
        throw new Error("No authentication token available. Please log in again.");
      }
      await apiDelete(`/api/user/models/${modelId}`, { token: authToken });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["userModels"] });
      queryClient.invalidateQueries({ queryKey: ["defaultModels"] });
      showToast({ title: "Model removed", variant: "success", duration: 3000 });
    },
    onError: (error) => {
      logError(error, "Failed to remove model");
      const errorMessage = error instanceof Error ? error.message : "Failed to remove model. Please try again.";
      showToast({ title: "Error removing model", description: errorMessage, variant: "error", duration: 5000 });
    },
  });

  const handleRemoveModel = useCallback((modelId: string) => {
    if (!modelId) {
      showToast({ title: "Invalid model ID", variant: "error", duration: 3000 });
      return;
    }
    deleteModelMutation.mutate(modelId);
  }, [deleteModelMutation]);





  // Check if a provider key can be deleted based on bundle rules
  const canDeleteProvider = (provider: string): { canDelete: boolean; reason?: string } => {
    const hasOpenRouter = !!savedApiKeys["openrouter"];
    const hasOpenAI = !!savedApiKeys["openai"];
    const hasAnthropic = !!savedApiKeys["anthropic"];

    // OpenAI and Anthropic are a bundle - must have BOTH or NEITHER
    // Valid configs: (1) OpenRouter only, (2) OpenAI + Anthropic bundle, (3) All three

    if (provider === "openrouter") {
      // Can delete OpenRouter if we have the OpenAI + Anthropic bundle
      if (hasOpenAI && hasAnthropic) {
        return { canDelete: true };
      }
      return { canDelete: false, reason: "OpenRouter is your only API key. Configure both OpenAI and Anthropic keys first." };
    }

    if (provider === "openai") {
      // Can delete OpenAI if we have OpenRouter (to fall back on)
      if (hasOpenRouter) {
        return { canDelete: true };
      }
      // Cannot delete OpenAI if it's bundled with Anthropic (no OpenRouter)
      if (hasAnthropic) {
        return { canDelete: false, reason: "OpenAI and Anthropic are a bundle. Delete both together or keep both." };
      }
      return { canDelete: true };
    }

    if (provider === "anthropic") {
      // Can delete Anthropic if we have OpenRouter (to fall back on)
      if (hasOpenRouter) {
        return { canDelete: true };
      }
      // Cannot delete Anthropic if it's bundled with OpenAI (no OpenRouter)
      if (hasOpenAI) {
        return { canDelete: false, reason: "OpenAI and Anthropic are a bundle. Delete both together or keep both." };
      }
      return { canDelete: true };
    }

    return { canDelete: true };
  };

  // Save a single provider's API key
  const saveProviderKey = useMutation({
    mutationFn: async ({ provider, key }: { provider: string; key: string }) => {
      const authToken = getAuthToken();

      // Build updated keys: include all saved keys, update/delete the current provider's key
      const updatedKeys = { ...savedApiKeys };
      if (key.trim()) {
        // Save the key
        updatedKeys[provider] = key;
      } else {
        // Delete the key (send empty string)
        updatedKeys[provider] = "";
      }
      return await apiPut<UserSettings>("/api/user/settings", {
        body: { providerApiKeys: updatedKeys },
        token: authToken || undefined,
        credentials: "include",
      });
    },
    onSuccess: (_, variables) => {
      // Update saved keys - remove if empty, add/update if not empty
      setSavedApiKeys((prev) => {
        const updated = { ...prev };
        if (variables.key.trim()) {
          updated[variables.provider] = variables.key;
        } else {
          // Key was deleted
          delete updated[variables.provider];
        }
        return updated;
      });
      
      // Clear revealed key and hide it when a new key is saved
      setRevealedKeys((prev) => {
        const updated = { ...prev };
        delete updated[variables.provider];
        return updated;
      });
      setShowKeys((prev) => ({
        ...prev,
        [variables.provider]: false,
      }));
      
      queryClient.invalidateQueries({ queryKey: ["userSettings"] });
      if (variables.key.trim()) {
        showToast({ title: `${variables.provider} API key saved!`, variant: "success", duration: 3000 });
      } else {
        showToast({ title: `${variables.provider} API key deleted!`, variant: "success", duration: 3000 });
      }
    },
    onError: (error, variables) => {
      logError(error, `Failed to save ${variables.provider} API key`);
      const errorMessage = error instanceof Error ? error.message : "Failed to save API key. Please try again.";
      showToast({ title: `Error saving ${variables.provider} API key`, description: errorMessage, variant: "error", duration: 5000 });
    },
  });

  // Helper function to check if a key is masked (defined early for use in callbacks)
  const isKeyMasked = useCallback((key: string | undefined): boolean => {
    if (!key || typeof key !== "string") return false;

    const trimmedKey = key.trim();

    // Check for old format with "..." (e.g., "sk-...abcd")
    if (trimmedKey.includes("...")) {
      return true;
    }

    // Check for new format: mostly asterisks
    // If it starts with asterisks, it's likely masked
    if (trimmedKey.startsWith("*")) {
      return true;
    }

    return false;
  }, []);

  const handleSaveProviderKey = useCallback(async (provider: string) => {
    const key = apiKeys[provider] || "";
    // Allow saving empty string to delete a key (if it was previously saved)
    const wasPreviouslySaved = !!savedApiKeys[provider];
    if (!key.trim() && !wasPreviouslySaved) {
      showToast({ title: "Please enter an API key first", variant: "error", duration: 3000 });
      return;
    }
    
    // Validate that the key is not masked before sending to backend
    // This prevents masked keys from being saved and provides immediate feedback
    if (key.trim() && isKeyMasked(key.trim())) {
      showToast({
        title: "Cannot save masked key",
        description: "This appears to be a masked key. Please enter your actual API key value.",
        variant: "error",
        duration: 5000,
      });
      return;
    }
    
    setSavingProvider(provider);
    try {
      // Send empty string to delete, or the actual key to save
      await saveProviderKey.mutateAsync({ provider, key: key.trim() });
    } finally {
      setSavingProvider(null);
    }
  }, [apiKeys, savedApiKeys, saveProviderKey, isKeyMasked, showToast]);

  // Filter models based on search (generic to preserve UserModel[] vs DefaultModel[])
  const filterModels = useCallback(
    <T extends DefaultModel | UserModel>(models: T[]): T[] => {
      if (!modelSearch.trim()) return models;
      const searchLower = modelSearch.toLowerCase();
      return models.filter((model) => {
        const displayName = model.display_name?.toLowerCase() || "";
        const provider = model.provider?.toLowerCase() || "";
        const apiId = model.api_identifier?.toLowerCase() || "";
        const description = (model.description || "").toLowerCase();
        return (
          displayName.includes(searchLower) ||
          provider.includes(searchLower) ||
          apiId.includes(searchLower) ||
          description.includes(searchLower)
        );
      }) as T[];
    },
    [modelSearch]
  );
  const displayDefaultModels = useMemo(() => filterModels(defaultModels), [filterModels, defaultModels]);
  const displayUserModels = useMemo(() => filterModels(userModels), [filterModels, userModels]);

  // Determine if a model is available based on user's API keys
  const isModelAvailable = useCallback((provider: string): boolean => {
    if (!provider) return false;

    const providerLower = provider.toLowerCase();
    const hasOpenRouter = !!savedApiKeys["openrouter"];
    const hasEdenAI = !!savedApiKeys["eden_ai"];

    // If user has OpenRouter or Eden AI, all models are available
    if (hasOpenRouter || hasEdenAI) {
      return true;
    }

    // Otherwise, check if user has the native provider key
    // Map model provider to API key provider name
    const providerMap: Record<string, string> = {
      "openai": "openai",
      "anthropic": "anthropic",
      "google": "google",
      "deepseek": "deepseek",
      "mistral": "mistral",
      "xai": "xai",
      "meta": "meta",
    };

    const keyProvider = providerMap[providerLower];
    return keyProvider ? !!savedApiKeys[keyProvider] : false;
  }, [savedApiKeys]);

  const getKeyDisplayValue = (provider: string): string => {
    // If key is being shown and we have a revealed value, use that
    if (showKeys[provider] && revealedKeys[provider]) {
      return revealedKeys[provider];
    }

    const key = apiKeys[provider];
    if (!key) return "";

    // If the key is masked, return empty string so the placeholder shows
    // The user can't see the masked key value in the input, they only see "Saved API Key" placeholder
    if (isKeyMasked(key)) {
      return "";
    }

    // Otherwise show the actual key (user input)
    return key;
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader2 className="h-8 w-8 animate-spin text-base-text-secondary" />
      </div>
    );
  }

  const activeSectionData = SETTINGS_SECTIONS.find(s => s.id === activeSection);

  return (
    <div className="container-box py-6">
      {/* Header */}
      <motion.header
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        className="mb-8"
      >
        <div className="flex items-start justify-between gap-4 mb-6">
          <div className="space-y-2">
            <h1 className="text-3xl font-bold text-base-text flex items-center gap-3">
              <Settings2 className="h-8 w-8 text-gold-500" />
              Settings
            </h1>
            <p className="text-base-subtext text-sm max-w-2xl">
              Configure your API keys and provider preferences for the debate engine.
              <Tooltip content="API keys are encrypted and stored securely. Only the last 4 characters are shown when saved.">
                <span className="inline-flex items-center gap-1 ml-1 text-gold-300 cursor-help">
                  Learn more
                  <Info className="h-3 w-3" />
                </span>
              </Tooltip>
            </p>
          </div>

          {/* Mobile Menu Button */}
          <button
            onClick={() => setSidebarOpen(!sidebarOpen)}
            className="lg:hidden p-2 rounded-lg border border-base-divider bg-base-panel hover:bg-base-elev transition-colors"
            aria-label="Toggle sidebar"
          >
            {sidebarOpen ? (
              <CloseIcon className="h-5 w-5 text-base-text" />
            ) : (
              <Menu className="h-5 w-5 text-base-text" />
            )}
          </button>
        </div>

        {/* Toast notifications now handled by ToastProvider */}
      </motion.header>

      <div className="flex gap-6">
        {/* Sidebar Navigation */}
        <aside
          className={cn(
            "lg:sticky lg:top-6 h-fit transition-all duration-300",
            "lg:w-64 lg:block",
            sidebarOpen
              ? "fixed inset-y-0 left-0 z-50 w-64 bg-base-bg border-r border-base-divider p-6 overflow-y-auto"
              : "hidden"
          )}
        >
          <div className="space-y-2">
            <h2 className="text-xs font-semibold text-base-subtext uppercase tracking-wider mb-4 px-3">
              Navigation
            </h2>
            {SETTINGS_SECTIONS.map((section) => {
              const Icon = section.icon;
              const isActive = activeSection === section.id;

              return (
                <motion.button
                  key={section.id}
                  onClick={() => {
                    setActiveSection(section.id);
                    setSidebarOpen(false);
                  }}
                  className={cn(
                    "w-full flex items-center gap-3 px-4 py-3 rounded-xl text-left",
                    "transition-colors duration-200",
                    "hover:bg-base-panel/50",
                    isActive
                      ? "bg-gold-500/10 border border-gold-500/30 text-gold-300"
                      : "border border-transparent text-base-text-secondary hover:text-base-text"
                  )}
                  whileHover={{ x: 4 }}
                  whileTap={{ scale: 0.98 }}
                >
                  <Icon className={cn(
                    "h-5 w-5 flex-shrink-0",
                    isActive ? "text-gold-400" : "text-base-subtext"
                  )} />
                  <div className="flex-1 min-w-0">
                    <div className="font-medium text-sm">{section.label}</div>
                    <div className="text-xs text-base-subtext mt-0.5 truncate">
                      {section.description}
                    </div>
                  </div>
                  {isActive && (
                    <motion.div
                      layoutId="activeIndicator"
                      className="w-1.5 h-1.5 rounded-full bg-gold-400"
                    />
                  )}
                </motion.button>
              );
            })}
          </div>
        </aside>

        {/* Overlay for mobile */}
        {sidebarOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setSidebarOpen(false)}
            className="fixed inset-0 bg-black/50 backdrop-blur-sm z-40 lg:hidden"
          />
        )}

        {/* Main Content */}
        <main className="flex-1 min-w-0">
          <AnimatePresence mode="wait">
            {activeSection === "api-keys" && (
              <motion.div
                key="api-keys"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                transition={{ duration: 0.2 }}
              >
                <APIKeysSection
                  providers={PROVIDERS}
                  apiKeys={apiKeys}
                  savedApiKeys={savedApiKeys}
                  revealedKeys={revealedKeys}
                  showKeys={showKeys}
                  loadingKeys={loadingKeys}
                  onApiKeyChange={handleApiKeyChange}
                  onToggleShowKey={toggleShowKey}
                  canDeleteProvider={canDeleteProvider}
                  onClearKey={async (provider) => {
                    // Clear revealed key before deletion
                    setRevealedKeys((prev) => {
                      const updated = { ...prev };
                      delete updated[provider];
                      return updated;
                    });
                    setShowKeys((prev) => ({
                      ...prev,
                      [provider]: false,
                    }));
                    
                    handleApiKeyChange(provider, "");

                    // Immediately save the deletion to backend
                    setSavingProvider(provider);
                    try {
                      await saveProviderKey.mutateAsync({ provider, key: "" });
                    } catch (error) {
                      logError(error, `Failed to delete ${provider} API key`);
                      const errorMessage = error instanceof Error ? error.message : "Failed to delete API key.";
                      showToast({ title: `Error deleting ${provider} API key`, description: errorMessage, variant: "error", duration: 5000 });
                    } finally {
                      setSavingProvider(null);
                    }
                  }}
                  onSaveProviderKey={handleSaveProviderKey}
                  isKeyMasked={isKeyMasked}
                  getKeyDisplayValue={getKeyDisplayValue}
                  savingProvider={savingProvider}
                />
              </motion.div>
            )}

            {activeSection === "models" && (
              <motion.div
                key="models"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                transition={{ duration: 0.2 }}
              >
                <ModelsSection
                  providers={PROVIDERS}
                  displayDefaultModels={displayDefaultModels}
                  displayUserModels={displayUserModels}
                  modelSearch={modelSearch}
                  onSearchChange={setModelSearch}
                  onToggleModel={handleToggleModel}
                  onDeleteModel={handleRemoveModel}
                  isDeleting={deleteModelMutation.isPending}
                  isModelAvailable={isModelAvailable}
                />
              </motion.div>
            )}

            {activeSection === "add-model" && (
              <motion.div
                key="add-model"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                transition={{ duration: 0.2 }}
              >
                <AddModelSection
                  providers={MODEL_PROVIDERS}
                  catalogModels={allModels}
                  userModels={userModels}
                  onRemove={handleRemoveModel}
                  onSuccess={() => {
                    queryClient.invalidateQueries({ queryKey: ["userModels"] });
                    queryClient.invalidateQueries({ queryKey: ["defaultModels"] });
                    showToast({ title: "Model added", variant: "success", duration: 3000 });
                  }}
                  onError={(msg) => {
                    showToast({ title: "Error", description: msg, variant: "error", duration: 5000 });
                  }}
                  getAuthToken={getAuthToken}
                  isDeleting={deleteModelMutation.isPending}
                />
              </motion.div>
            )}
          </AnimatePresence>
        </main>
      </div>
    </div>
  );
}

// API Keys Section Component
function APIKeysSection({
  providers,
  apiKeys,
  savedApiKeys,
  revealedKeys,
  showKeys,
  loadingKeys,
  onApiKeyChange,
  onToggleShowKey,
  canDeleteProvider,
  onClearKey,
  onSaveProviderKey,
  isKeyMasked,
  getKeyDisplayValue,
  savingProvider,
}: {
  providers: typeof PROVIDERS;
  apiKeys: ProviderApiKeys;
  savedApiKeys: ProviderApiKeys;
  revealedKeys: { [key: string]: string };
  showKeys: { [key: string]: boolean };
  loadingKeys: { [key: string]: boolean };
  onApiKeyChange: (provider: string, value: string) => void;
  onToggleShowKey: (provider: string) => void;
  canDeleteProvider: (provider: string) => { canDelete: boolean; reason?: string };
  onClearKey: (provider: string) => void;
  onSaveProviderKey: (provider: string) => void;
  isKeyMasked: (key: string | undefined) => boolean;
  getKeyDisplayValue: (provider: string) => string;
  savingProvider: string | null;
}) {
  return (
    <div className="space-y-6">
      <GlassCard variant="elevated" className="p-8">
        <div className="mb-8">
          <h2 className="text-2xl font-bold text-base-text mb-2 flex items-center gap-2">
            <Key className="h-6 w-6 text-gold-400" />
            Provider API Keys
          </h2>
          <p className="text-base-subtext text-sm">
            Enter your API keys for each provider. Keys are encrypted and stored securely.
            Use the Add Model tab to add models that use these keys.
          </p>
        </div>

        <div className="grid gap-4">
          {providers.map((provider) => {
            const keyValue = apiKeys[provider.id] || "";
            const savedKey = savedApiKeys[provider.id];
            const isMasked = isKeyMasked(keyValue);
            const displayValue = getKeyDisplayValue(provider.id);
            const hasKey = !!keyValue;
            const hasSavedKey = !!savedKey;
            const hasUnsavedChanges = keyValue !== savedKey;
            const isSaving = savingProvider === provider.id;
            const isLoading = loadingKeys[provider.id];

            return (
              <motion.div
                key={provider.id}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className={cn(
                  "p-5 rounded-xl border transition-all",
                  hasSavedKey
                    ? "bg-gold-500/5 border-gold-500/20"
                    : "bg-base-panel/30 border-base-divider hover:border-gold-500/30"
                )}
              >
                <div className="flex items-start justify-between mb-4">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <label className="text-sm font-semibold text-base-text uppercase">
                        {provider.name}
                      </label>
                      <Tooltip content={provider.description}>
                        <HelpCircle className="h-3.5 w-3.5 text-base-subtext/60 cursor-help" />
                      </Tooltip>
                    </div>
                  </div>
                  {/* Status indicator: green if saved, gray if not */}
                  <div className="flex items-center gap-2">
                    <motion.div
                      initial={{ scale: 0 }}
                      animate={{ scale: 1 }}
                      className={cn(
                        "w-2.5 h-2.5 rounded-full",
                        hasSavedKey ? "bg-green-400" : "bg-gray-400"
                      )}
                    />
                  </div>
                </div>

                <div className="space-y-3">
                  <div className="relative">
                    <input
                      type={showKeys[provider.id] ? "text" : "password"}
                      value={displayValue}
                      onChange={(e) => {
                        const newValue = e.target.value;
                        onApiKeyChange(provider.id, newValue);
                      }}
                      placeholder={
                        isLoading
                          ? "Loading..."
                          : isMasked
                            ? "Saved API Key (Revealed to edit)"
                            : `Enter ${provider.name} API key`
                      }
                      disabled={isLoading}
                      className={cn(
                        "w-full px-4 py-3 bg-base-bg border rounded-lg text-base-text",
                        "focus:outline-none focus:ring-2 focus:ring-gold-500/50 focus:border-gold-500/50",
                        "transition-all",
                        isLoading && "opacity-50 cursor-wait",
                        // Padding: need pr-20 if showing 2 buttons (save+eye OR minus+eye), otherwise pr-12 for just eye
                        ((hasUnsavedChanges && keyValue) || (hasSavedKey && showKeys[provider.id])) ? "pr-20" : "pr-12"
                      )}
                    />
                    {/* Loading indicator when fetching unmasked key */}
                    {isLoading && (
                      <div className="absolute right-3 top-1/2 -translate-y-1/2">
                        <Loader2 className="h-4 w-4 animate-spin text-base-text-secondary" />
                      </div>
                    )}
                    {/* Save button (checkmark) - show when there's unsaved changes */}
                    {hasUnsavedChanges && keyValue && (
                      <button
                        type="button"
                        onClick={() => onSaveProviderKey(provider.id)}
                        disabled={isSaving}
                        className="absolute right-12 top-1/2 -translate-y-1/2 text-green-400 hover:text-green-300 transition-colors p-1 disabled:opacity-50"
                        aria-label="Save API key"
                      >
                        {isSaving ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <Check className="h-4 w-4" />
                        )}
                      </button>
                    )}
                    {/* Eye toggle - only show when there's a saved key that can be revealed */}
                    {(() => {
                      // Only show reveal button if:
                      // 1. There's a saved key
                      // 2. The current key is masked (matches savedApiKeys)
                      // 3. There are no unsaved changes
                      // 4. Not currently loading
                      const canReveal = hasSavedKey && 
                                       isMasked && 
                                       !hasUnsavedChanges && 
                                       !isLoading;
                      
                      // Show eye button if we can reveal OR if key is already showing
                      const shouldShowEye = canReveal || (keyValue && showKeys[provider.id] && !isLoading);
                      
                      if (!shouldShowEye) return null;
                      
                      return (
                        <button
                          type="button"
                          onClick={() => onToggleShowKey(provider.id)}
                          disabled={!canReveal && !showKeys[provider.id]}
                          className={cn(
                            "absolute right-3 top-1/2 -translate-y-1/2 transition-colors p-1",
                            canReveal || showKeys[provider.id]
                              ? "text-base-text-secondary hover:text-base-text cursor-pointer"
                              : "text-base-subtext/50 cursor-not-allowed opacity-50"
                          )}
                          aria-label={showKeys[provider.id] ? "Hide key" : "Show key"}
                          title={canReveal ? (showKeys[provider.id] ? "Hide key" : "Show key") : "Save changes first to reveal key"}
                        >
                          {showKeys[provider.id] ? (
                            <EyeOff className="h-4 w-4" />
                          ) : (
                            <Eye className="h-4 w-4" />
                          )}
                        </button>
                      );
                    })()}
                    {/* Remove button (minus) - show when key is revealed, positioned to the left of eye icon */}
                    {hasSavedKey && showKeys[provider.id] && (() => {
                      const deleteCheck = canDeleteProvider(provider.id);
                      return (
                        <button
                          type="button"
                          onClick={() => deleteCheck.canDelete && onClearKey(provider.id)}
                          disabled={!deleteCheck.canDelete}
                          className={`absolute right-12 top-1/2 -translate-y-1/2 transition-colors p-1 ${deleteCheck.canDelete
                            ? "text-red-400 hover:text-red-300 cursor-pointer"
                            : "text-gray-600 cursor-not-allowed opacity-50"
                            }`}
                          aria-label={deleteCheck.canDelete ? "Remove API key" : deleteCheck.reason}
                          title={deleteCheck.canDelete ? "Remove API key" : deleteCheck.reason}
                        >
                          <Minus className="h-4 w-4" />
                        </button>
                      );
                    })()}
                  </div>


                  {isMasked && (
                    <p className="text-xs text-base-subtext flex items-center gap-1.5">
                      <Info className="h-3 w-3" />
                      Key is saved. Click reveal to see or edit.
                    </p>
                  )}
                </div>
              </motion.div>
            );
          })}
        </div>

      </GlassCard>
    </div>
  );
}

// Models Section Component
function ModelsSection({
  providers,
  displayDefaultModels,
  displayUserModels,
  modelSearch,
  onSearchChange,
  onToggleModel,
  onDeleteModel,
  isDeleting,
  isModelAvailable,
}: {
  providers: typeof PROVIDERS;
  displayDefaultModels: DefaultModel[];
  displayUserModels: UserModel[];
  modelSearch: string;
  onSearchChange: (value: string) => void;
  onToggleModel: (model: UserModel) => void;
  onDeleteModel: (id: string) => void;
  isDeleting: boolean;
  isModelAvailable: (provider: string) => boolean;
}) {
  const renderModelRow = (model: DefaultModel | UserModel, isUser: boolean) => {
    const isEnabled: boolean = isUser ? (model as UserModel).enabled : true;
    const isAvailable = isModelAvailable(model.provider || "");

    return (
      <motion.div
        key={model.id}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        className={cn(
          "flex items-center justify-between px-5 py-4 border-b border-base-divider/30 transition-all",
          isUser && "cursor-pointer",
          isUser && isEnabled
            ? "bg-gold-500/10 hover:bg-gold-500/15"
            : isUser
              ? "bg-transparent hover:bg-base-bg/50 opacity-60"
              : "bg-transparent hover:bg-base-bg/50"
        )}
        onClick={() => isUser && onToggleModel(model as UserModel)}
      >
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-3 mb-1">
            <p className="text-sm font-semibold text-base-text truncate">
              {model.display_name}
            </p>
            {isUser && (
              <div
                className={cn(
                  "w-2 h-2 rounded-full transition-all",
                  isEnabled ? "bg-green-400" : "bg-base-subtext/40"
                )}
              />
            )}
            {/* Availability indicator */}
            {isAvailable ? (
              <Tooltip content="Model is available with your current API keys">
                <div className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-green-500/10 border border-green-500/30">
                  <Shield className="h-3 w-3 text-green-400" />
                  <span className="text-xs font-medium text-green-400">Available</span>
                </div>
              </Tooltip>
            ) : (
              <Tooltip content="API key required. Add the provider's API key or use OpenRouter/Eden AI to access this model.">
                <div className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-base-panel/50 border border-base-divider">
                  <AlertCircle className="h-3 w-3 text-base-subtext" />
                  <span className="text-xs font-medium text-base-subtext">Unavailable</span>
                </div>
              </Tooltip>
            )}
          </div>
          <p className="text-xs text-base-subtext truncate">{model.api_identifier}</p>
          {model.description && (
            <p className="text-xs text-base-subtext/70 mt-1 line-clamp-1">
              {model.description}
            </p>
          )}
        </div>
        <div className="flex-shrink-0 ml-4 flex items-center gap-2">
          {isUser && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onDeleteModel(model.id);
              }}
              disabled={isDeleting}
              className="p-2 rounded-lg text-base-subtext hover:text-red-400 hover:bg-red-500/10 transition-colors disabled:opacity-50"
              aria-label="Remove model"
            >
              <Trash2 className="h-4 w-4" />
            </button>
          )}
          <span className="text-xs px-3 py-1 rounded-full bg-base-panel/70 text-base-subtext border border-base-divider/50">
            {providers.find((p) => p.id === (model.provider || "").toLowerCase())?.name || (model.provider || "").toLowerCase()}
          </span>
        </div>
      </motion.div>
    );
  };

  const hasAny = displayDefaultModels.length > 0 || displayUserModels.length > 0;

  // Calculate availability stats
  const allDisplayedModels = [...displayDefaultModels, ...displayUserModels];
  const availableCount = allDisplayedModels.filter(m => isModelAvailable(m.provider || "")).length;
  const totalCount = allDisplayedModels.length;

  return (
    <div className="space-y-6">
      <GlassCard variant="elevated" className="p-8">
        <div className="mb-6">
          <div className="flex items-start justify-between gap-4 mb-4">
            <div>
              <h2 className="text-2xl font-bold text-base-text mb-2 flex items-center gap-2">
                <Cpu className="h-6 w-6 text-gold-400" />
                LLM Models
              </h2>
              <p className="text-sm text-base-subtext">
                Default models from the system and models you added. Use the Add Model tab to add more.
                Toggle or remove your models as needed.
              </p>
            </div>
            {totalCount > 0 && (
              <div className="flex-shrink-0">
                <div className="px-4 py-2 rounded-xl bg-base-panel/50 border border-base-divider">
                  <div className="text-center">
                    <div className="text-2xl font-bold text-base-text">
                      <span className="text-green-400">{availableCount}</span>
                      <span className="text-base-subtext mx-1">/</span>
                      <span>{totalCount}</span>
                    </div>
                    <div className="text-xs text-base-subtext mt-1">Available Models</div>
                  </div>
                </div>
              </div>
            )}
          </div>
          {availableCount < totalCount && totalCount > 0 && (
            <motion.div
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              className="flex items-start gap-3 p-4 rounded-xl bg-blue-500/10 border border-blue-500/30"
            >
              <Info className="h-5 w-5 text-blue-400 flex-shrink-0 mt-0.5" />
              <div className="flex-1">
                <p className="text-sm text-blue-300 font-medium mb-1">
                  {totalCount - availableCount} model{totalCount - availableCount !== 1 ? 's' : ''} unavailable
                </p>
                <p className="text-xs text-blue-200/70">
                  Add provider API keys in the API Keys tab, or add an OpenRouter/Eden AI key to access all models.
                </p>
              </div>
            </motion.div>
          )}
        </div>

        <div className="relative mb-6">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-base-subtext" />
          <input
            type="text"
            placeholder="Search models by name, provider, or identifier..."
            value={modelSearch}
            onChange={(e) => onSearchChange(e.target.value)}
            className="w-full pl-11 pr-4 py-3 bg-base-bg border border-base-divider rounded-lg text-base-text focus:outline-none focus:ring-2 focus:ring-gold-500/50 focus:border-gold-500/50 transition-all"
          />
        </div>

        <div
          role="listbox"
          aria-label="LLM Models"
          className="border border-base-divider rounded-xl bg-base-bg/30 overflow-hidden"
        >
          <div className="max-h-[600px] overflow-y-auto">
            {hasAny ? (
              <>
                {displayUserModels.length > 0 && (
                  <div className="px-4 py-2 bg-gold-500/5 border-b border-base-divider/50 text-xs font-semibold text-gold-400 uppercase tracking-wider">
                    Your models
                  </div>
                )}
                {displayUserModels.map((m) => renderModelRow(m, true))}
                {displayDefaultModels.length > 0 && (
                  <div className="px-4 py-2 bg-gold-500/5 border-b border-base-divider/50 text-xs font-semibold text-gold-400 uppercase tracking-wider">
                    Default models
                  </div>
                )}
                {displayDefaultModels.map((m) => renderModelRow(m, false))}
              </>
            ) : (
              <div className="text-center py-16 text-base-subtext">
                <Cpu className="h-12 w-12 mx-auto mb-4 text-base-subtext/30" />
                <p className="text-sm font-medium mb-2">No models found</p>
                {modelSearch && (
                  <p className="text-xs text-base-subtext/70 mt-2">
                    Try adjusting your search query
                  </p>
                )}
                {!modelSearch && (
                  <p className="text-xs text-base-subtext/70">
                    Use the Add Model tab to add models to your list
                  </p>
                )}
              </div>
            )}
          </div>
        </div>
      </GlassCard>
    </div>
  );
}

type DraftRow = { id: string; provider: string; api_identifier: string; display_name: string; description: string };

// Add Model Section Component: catalog table (all in llm_models) + SharePoint-like add-row table
function AddModelSection({
  providers,
  catalogModels,
  userModels,
  onRemove,
  onSuccess,
  onError,
  getAuthToken,
  isDeleting,
}: {
  providers: typeof PROVIDERS;
  catalogModels: DefaultModel[];
  userModels: UserModel[];
  onRemove: (id: string) => void;
  onSuccess: () => void;
  onError: (message: string) => void;
  getAuthToken: () => string | null;
  isDeleting: boolean;
}) {
  const [catalogSearch, setCatalogSearch] = useState("");
  const [draftRows, setDraftRows] = useState<DraftRow[]>([]);
  const [addingId, setAddingId] = useState<string | null>(null); // "draft" when adding drafts

  const filteredCatalog = useMemo(() => {
    if (!catalogSearch.trim()) return catalogModels;
    const q = catalogSearch.toLowerCase();
    return catalogModels.filter(
      (m) =>
        (m.display_name || "").toLowerCase().includes(q) ||
        (m.provider || "").toLowerCase().includes(q) ||
        (m.api_identifier || "").toLowerCase().includes(q) ||
        (m.description || "").toLowerCase().includes(q)
    );
  }, [catalogModels, catalogSearch]);

  const addDraftRow = useCallback(() => {
    setDraftRows((prev) => [
      ...prev,
      { id: crypto.randomUUID(), provider: "openai", api_identifier: "", display_name: "", description: "" },
    ]);
  }, []);

  const updateDraftRow = useCallback((id: string, field: keyof DraftRow, value: string) => {
    setDraftRows((prev) => prev.map((r) => (r.id === id ? { ...r, [field]: value } : r)));
  }, []);

  const removeDraftRow = useCallback((id: string) => {
    setDraftRows((prev) => prev.filter((r) => r.id !== id));
  }, []);

  const postOne = useCallback(
    async (body: { provider: string; api_identifier: string; display_name: string; description?: string }) => {
      const res = await apiPost<UserModel>("/api/user/models", { token: getAuthToken(), body });
      return res;
    },
    [getAuthToken]
  );

  const handleAddDrafts = useCallback(async () => {
    const toAdd = draftRows.filter((r) => (r.provider || "").trim() && (r.api_identifier || "").trim());
    if (toAdd.length === 0) {
      onError("Fill in at least Provider and API identifier for one row.");
      return;
    }
    setAddingId("draft");
    const added: string[] = [];
    const errs: string[] = [];
    for (let i = 0; i < toAdd.length; i++) {
      const r = toAdd[i];
      const prov = (r.provider || "").trim().toLowerCase();
      const aid = (r.api_identifier || "").trim();
      const dname = (r.display_name || "").trim() || aid;
      try {
        await postOne({ provider: prov, api_identifier: aid, display_name: dname, description: (r.description || "").trim() || undefined });
        added.push(r.id);
      } catch (e) {
        errs.push(`${aid || "row"}: ${(e as Error)?.message || "Failed"}`);
      }
    }
    setAddingId(null);
    if (added.length) {
      setDraftRows((prev) => prev.filter((r) => !added.includes(r.id)));
      onSuccess();
    }
    if (errs.length) onError(errs.join("; "));
  }, [draftRows, onError, onSuccess, postOne]);

  const tableInput =
    "w-full min-w-0 px-2 py-1.5 text-sm bg-base-bg border border-base-divider rounded focus:outline-none focus:ring-1 focus:ring-gold-500/50 text-base-text";
  const th = "px-4 py-3 text-left text-xs font-semibold text-base-subtext uppercase tracking-wider border-b border-base-divider";

  return (
    <div className="space-y-8">
      {/* Catalog: all LLMs from database */}
      <GlassCard variant="elevated" className="p-8">
        <div className="mb-4">
          <h2 className="text-xl font-bold text-base-text mb-1">Models in catalog</h2>
          <p className="text-sm text-base-subtext">All models in the database (seeded + user-added). Remove only models you added. Search to filter.</p>
        </div>
        <div className="relative mb-4 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-base-subtext" />
          <input
            type="text"
            placeholder="Search by name, provider, or API id..."
            value={catalogSearch}
            onChange={(e) => setCatalogSearch(e.target.value)}
            className="w-full pl-10 pr-4 py-2 bg-base-bg border border-base-divider rounded-lg text-base-text text-sm focus:outline-none focus:ring-2 focus:ring-gold-500/50"
          />
        </div>
        <div className="border border-base-divider rounded-xl overflow-hidden">
          <div className="overflow-x-auto max-h-[320px] overflow-y-auto">
            <table className="w-full border-collapse">
              <thead className="sticky top-0 bg-base-panel/95 border-b border-base-divider">
                <tr>
                  <th className={th}>Provider</th>
                  <th className={th}>API identifier</th>
                  <th className={th}>Display name</th>
                  <th className={th}>Description</th>
                  <th className={th + " w-32"}>Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-base-divider/50">
                {filteredCatalog.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="px-4 py-8 text-center text-base-subtext text-sm">
                      {catalogSearch ? "No models match the search." : "No models in the catalog."}
                    </td>
                  </tr>
                ) : (
                  filteredCatalog.map((m) => {
                    const canRemove = userModels.some((um) => um.id === m.id);
                    return (
                      <tr key={m.id} className="hover:bg-base-panel/40">
                        <td className="px-4 py-2 text-sm text-base-text">{(m.provider || "").toLowerCase()}</td>
                        <td className="px-4 py-2 text-sm text-base-text font-mono">{m.api_identifier}</td>
                        <td className="px-4 py-2 text-sm text-base-text">{m.display_name}</td>
                        <td className="px-4 py-2 text-sm text-base-subtext max-w-[200px] truncate">{m.description || "—"}</td>
                        <td className="px-4 py-2">
                          {canRemove ? (
                            <button
                              type="button"
                              disabled={isDeleting}
                              onClick={(e) => {
                                e.stopPropagation();
                                e.preventDefault();
                                onRemove(m.id);
                              }}
                              className="text-xs px-2 py-1 rounded bg-red-500/20 text-red-300 hover:bg-red-500/30 disabled:opacity-50 cursor-pointer transition-colors"
                            >
                              {isDeleting ? "Removing..." : "Remove"}
                            </button>
                          ) : (
                            "—"
                          )}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      </GlassCard>

      {/* Custom: add rows (SharePoint-like) */}
      <GlassCard variant="elevated" className="p-8">
        <div className="mb-4">
          <h2 className="text-xl font-bold text-base-text mb-1">Add custom models</h2>
          <p className="text-sm text-base-subtext">Add a row for each model. Provider is a dropdown; API identifier is required.</p>
        </div>
        <div className="border border-base-divider rounded-xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full border-collapse">
              <thead className="bg-base-panel/80 border-b border-base-divider">
                <tr>
                  <th className={th}>Provider</th>
                  <th className={th}>API identifier</th>
                  <th className={th}>Display name</th>
                  <th className={th}>Description</th>
                  <th className={th + " w-20"}></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-base-divider/50">
                {draftRows.map((r) => (
                  <tr key={r.id} className="hover:bg-base-panel/30">
                    <td className="px-2 py-1.5">
                      <select
                        value={r.provider}
                        onChange={(e) => updateDraftRow(r.id, "provider", e.target.value)}
                        className={tableInput}
                      >
                        {providers.map((p) => (
                          <option key={p.id} value={p.id}>
                            {p.name}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className="px-2 py-1.5">
                      <input
                        value={r.api_identifier}
                        onChange={(e) => updateDraftRow(r.id, "api_identifier", e.target.value)}
                        placeholder="e.g. openai/gpt-4o"
                        className={tableInput}
                      />
                    </td>
                    <td className="px-2 py-1.5">
                      <input
                        value={r.display_name}
                        onChange={(e) => updateDraftRow(r.id, "display_name", e.target.value)}
                        placeholder="Optional"
                        className={tableInput}
                      />
                    </td>
                    <td className="px-2 py-1.5">
                      <input
                        value={r.description}
                        onChange={(e) => updateDraftRow(r.id, "description", e.target.value)}
                        placeholder="Optional"
                        className={tableInput}
                      />
                    </td>
                    <td className="px-2 py-1.5">
                      <button
                        type="button"
                        onClick={() => removeDraftRow(r.id)}
                        className="p-1.5 rounded text-base-subtext hover:text-red-400 hover:bg-red-500/10"
                        aria-label="Remove row"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={addDraftRow}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg border border-base-divider bg-base-panel/50 hover:bg-base-panel text-base-text text-sm"
          >
            <Plus className="h-4 w-4" />
            Add row
          </button>
          <button
            type="button"
            onClick={handleAddDrafts}
            disabled={addingId === "draft" || draftRows.every((r) => !(r.provider || "").trim() || !(r.api_identifier || "").trim())}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-gold-500 hover:bg-gold-600 text-white text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {addingId === "draft" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
            Add to my list
          </button>
        </div>
      </GlassCard>
    </div>
  );
}
