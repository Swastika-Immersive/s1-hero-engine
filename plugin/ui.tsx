import React, { useState, useEffect, useMemo, useCallback } from 'react';
import ReactMarkdown from 'react-markdown';

const BACKEND_BASE_URL = "https://backend-mocha-six-61.vercel.app";

interface Message {
  role: 'user' | 'assistant';
  content: string;
}

interface AssistantResponse {
  message: string;
  helper: string;
  inputType: 'cards' | 'toggles' | 'text' | 'config_form' | 'result';
  options?: Array<{
    label: string;
    value: string;
    icon: string;
    tag: string;
    subtitle: string;
    accent: string;
    primary: boolean;
    status?: string;
  }>;
  toggles?: Array<{
    key: string;
    label: string;
    helper: string;
    default: boolean;
  }>;
  fields?: Array<{
    key: string;
    label: string;
    icon: string;
    default: {
      label: string;
      value: string;
      subtitle: string;
      accent: string;
    };
    alternatives: Array<{
      label: string;
      value: string;
      subtitle: string;
      accent: string;
    }>;
  }>;
  finalPrompt?: string;
  allowFreeText: boolean;
  step: number;
}

// Seed message for STEP 0 mode selection
const seedMessage: AssistantResponse = {
  message: "How do you want to work today?",
  helper: "Choose a mode to get started",
  inputType: "cards",
  options: [
    {
      label: "Single Image",
      value: "single",
      icon: "📷",
      tag: "MODE",
      subtitle: "One subject, one clean hero shot",
      accent: "purple",
      primary: true,
      status: "RECOMMENDED"
    },
    {
      label: "Consistent Multi-Image",
      value: "consistent",
      icon: "🔄",
      tag: "MODE",
      subtitle: "Multiple subjects, unified style",
      accent: "blue",
      primary: false
    },
    {
      label: "Variation Multi-Image",
      value: "variation",
      icon: "🎲",
      tag: "MODE",
      subtitle: "Explore variations (Low/Medium/High)",
      accent: "green",
      primary: false
    },
    {
      label: "One Composition",
      value: "composition",
      icon: "🎨",
      tag: "MODE",
      subtitle: "Multiple subjects in one frame",
      accent: "orange",
      primary: false
    }
  ],
  toggles: [],
  allowFreeText: false,
  step: 0
};

function CardOption({ option, selected, onClick, disabled }: {
  option: AssistantResponse['options'][0];
  selected: boolean;
  onClick: () => void;
  disabled?: boolean;
}) {
  const baseStyle = {
    width: '100%',
    backgroundColor: '#1a1a22',
    borderRadius: '16px',
    padding: '14px',
    position: 'relative' as const,
    cursor: disabled ? 'not-allowed' : 'pointer',
    opacity: disabled ? 0.4 : 1,
    transition: 'all 0.2s ease',
    border: selected ? '2px solid transparent' : '1px solid rgba(255,255,255,0.1)',
    borderImage: selected ? 'linear-gradient(135deg, #a855f7, #ec4899) 1' : 'none',
    transform: selected ? 'scale(1.01)' : 'scale(1)',
  };

  const accentColors: Record<string, string> = {
    purple: '#a855f7',
    blue: '#3b82f6',
    green: '#22c55e',
    orange: '#f97316',
  };

  return (
    <div
      style={baseStyle}
      onClick={disabled ? undefined : onClick}
      onMouseEnter={(e) => {
        if (!disabled && !selected) {
          e.currentTarget.style.boxShadow = '0 0 20px rgba(168, 85, 247, 0.3)';
          e.currentTarget.style.transform = 'scale(1.01)';
        }
      }}
      onMouseLeave={(e) => {
        if (!disabled && !selected) {
          e.currentTarget.style.boxShadow = 'none';
          e.currentTarget.style.transform = 'scale(1)';
        }
      }}
    >
      <div style={{
        position: 'absolute',
        left: 0,
        top: 0,
        bottom: 0,
        width: '3px',
        backgroundColor: accentColors[option.accent] || accentColors.purple,
        borderTopLeftRadius: '16px',
        borderBottomLeftRadius: '16px',
      }} />
      
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '8px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span style={{ fontSize: '16px' }}>{option.icon}</span>
          <span style={{
            fontSize: '10px',
            fontWeight: 600,
            textTransform: 'uppercase',
            letterSpacing: '0.5px',
            color: accentColors[option.accent] || accentColors.purple,
          }}>{option.tag}</span>
        </div>
        {option.status && (
          <span style={{
            fontSize: '10px',
            fontWeight: 600,
            padding: '2px 8px',
            borderRadius: '4px',
            backgroundColor: 'rgba(168, 85, 247, 0.2)',
            color: '#a855f7',
          }}>{option.status}</span>
        )}
      </div>
      
      <div style={{ fontSize: '15px', fontWeight: 600, color: '#fff', marginBottom: '4px' }}>
        {option.label}
      </div>
      
      <div style={{ fontSize: '12px', color: 'rgba(255,255,255,0.6)' }}>
        {option.subtitle}
      </div>

      {selected && (
        <div style={{
          position: 'absolute',
          top: '14px',
          right: '14px',
          width: '20px',
          height: '20px',
          borderRadius: '50%',
          background: 'linear-gradient(135deg, #a855f7, #ec4899)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: '12px',
        }}>✓</div>
      )}

      {option.primary && !selected && (
        <div style={{
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          borderRadius: '16px',
          border: '1px solid rgba(168, 85, 247, 0.3)',
          pointerEvents: 'none',
        }} />
      )}
    </div>
  );
}

function Toggle({ toggle, value, onChange }: {
  toggle: AssistantResponse['toggles'][0];
  value: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '16px',
        backgroundColor: '#1a1a22',
        borderRadius: '12px',
        cursor: 'pointer',
        marginBottom: '12px',
      }}
      onClick={() => onChange(!value)}
    >
      <div>
        <div style={{ fontSize: '14px', fontWeight: 600, color: '#fff', marginBottom: '4px' }}>
          {toggle.label}
        </div>
        {toggle.helper && (
          <div style={{ fontSize: '12px', color: 'rgba(255,255,255,0.6)' }}>
            {toggle.helper}
          </div>
        )}
      </div>
      
      <div style={{
        width: '44px',
        height: '24px',
        borderRadius: '12px',
        backgroundColor: value ? 'linear-gradient(135deg, #a855f7, #ec4899)' : '#2a2a32',
        position: 'relative',
        transition: 'background 0.2s ease',
      }}>
        <div style={{
          position: 'absolute',
          top: '2px',
          left: value ? '22px' : '2px',
          width: '20px',
          height: '20px',
          borderRadius: '50%',
          backgroundColor: value ? '#fff' : '#888',
          transition: 'left 0.2s ease',
        }} />
      </div>
    </div>
  );
}

function ConfigForm({ fields, onSubmit }: {
  fields: AssistantResponse['fields'];
  onSubmit: (values: Record<string, string>) => void;
}) {
  const [selectedValues, setSelectedValues] = useState<Record<string, string>>({});
  const [expandedFields, setExpandedFields] = useState<Record<string, boolean>>({});

  const toggleField = (key: string) => {
    setExpandedFields(prev => ({ ...prev, [key]: !prev[key] }));
  };

  const selectOption = (fieldKey: string, value: string) => {
    setSelectedValues(prev => ({ ...prev, [fieldKey]: value }));
  };

  const handleSubmit = () => {
    onSubmit(selectedValues);
  };

  return (
    <div>
      {fields?.map((field) => {
        const selected = selectedValues[field.key] || field.default.value;
        const isExpanded = expandedFields[field.key];
        const accentColors: Record<string, string> = {
          purple: '#a855f7',
          blue: '#3b82f6',
          green: '#22c55e',
          orange: '#f97316',
        };

        const currentOption = [...field.alternatives, field.default].find(opt => opt.value === selected) || field.default;

        return (
          <div key={field.key} style={{ marginBottom: '16px' }}>
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '16px',
                backgroundColor: '#1a1a22',
                borderRadius: '12px',
                cursor: 'pointer',
              }}
              onClick={() => toggleField(field.key)}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                <span style={{ fontSize: '18px' }}>{field.icon}</span>
                <div>
                  <div style={{ fontSize: '14px', fontWeight: 600, color: '#fff' }}>
                    {field.label}
                  </div>
                  <div style={{ fontSize: '12px', color: accentColors[currentOption.accent] }}>
                    {currentOption.label}
                  </div>
                </div>
              </div>
              <span style={{ fontSize: '12px', color: 'rgba(255,255,255,0.6)' }}>
                {isExpanded ? '▲' : '▼'}
              </span>
            </div>

            {isExpanded && (
              <div style={{ marginTop: '8px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {field.alternatives.map((alt) => (
                  <div
                    key={alt.value}
                    style={{
                      padding: '12px',
                      backgroundColor: '#15151a',
                      borderRadius: '8px',
                      cursor: 'pointer',
                      border: selected === alt.value ? `1px solid ${accentColors[alt.accent]}` : '1px solid rgba(255,255,255,0.1)',
                    }}
                    onClick={() => selectOption(field.key, alt.value)}
                  >
                    <div style={{ fontSize: '13px', fontWeight: 600, color: '#fff', marginBottom: '2px' }}>
                      {alt.label}
                    </div>
                    <div style={{ fontSize: '11px', color: 'rgba(255,255,255,0.5)' }}>
                      {alt.subtitle}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        );
      })}

      <button
        style={{
          width: '100%',
          padding: '14px',
          marginTop: '16px',
          background: 'linear-gradient(135deg, #a855f7, #ec4899)',
          border: 'none',
          borderRadius: '12px',
          color: '#fff',
          fontSize: '14px',
          fontWeight: 600,
          cursor: 'pointer',
        }}
        onClick={handleSubmit}
      >
        Continue →
      </button>
    </div>
  );
}

function ResultScreen({ finalPrompt, onCopy, onReset }: {
  finalPrompt: string;
  onCopy: () => void;
  onReset: () => void;
}) {
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    onCopy();
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <div>
      <div style={{ fontSize: '18px', fontWeight: 600, color: '#fff', marginBottom: '16px' }}>
        Your prompt is ready
      </div>
      
      <div style={{
        backgroundColor: '#15151a',
        borderRadius: '12px',
        padding: '16px',
        marginBottom: '16px',
        border: '1px solid rgba(168, 85, 247, 0.2)',
        boxShadow: '0 0 20px rgba(168, 85, 247, 0.1)',
      }}>
        <pre style={{
          margin: 0,
          fontFamily: 'Monaco, Consolas, monospace',
          fontSize: '12px',
          color: '#e0e0e0',
          whiteSpace: 'pre-wrap',
          wordBreak: 'break-word',
        }}>
          {finalPrompt}
        </pre>
      </div>

      <button
        style={{
          width: '100%',
          padding: '14px',
          marginBottom: '12px',
          background: 'linear-gradient(135deg, #a855f7, #ec4899)',
          border: 'none',
          borderRadius: '12px',
          color: '#fff',
          fontSize: '14px',
          fontWeight: 600,
          cursor: 'pointer',
        }}
        onClick={handleCopy}
      >
        {copied ? '✓ Copied!' : '📋 Copy prompt'}
      </button>

      <button
        style={{
          width: '100%',
          padding: '14px',
          backgroundColor: '#1a1a22',
          border: '1px solid rgba(255,255,255,0.1)',
          borderRadius: '12px',
          color: '#fff',
          fontSize: '14px',
          fontWeight: 600,
          cursor: 'pointer',
        }}
        onClick={onReset}
      >
        Start Over
      </button>
    </div>
  );
}

function ErrorBoundary({ children, fallback }: {
  children: React.ReactNode;
  fallback: React.ReactNode;
}) {
  const [hasError, setHasError] = useState(false);

  useEffect(() => {
    const handleError = () => setHasError(true);
    window.addEventListener('error', handleError);
    return () => window.removeEventListener('error', handleError);
  }, []);

  if (hasError) {
    return <>{fallback}</>;
  }

  return <>{children}</>;
}

export default function App() {
  const [messages, setMessages] = useState<Message[]>(() => [
    { role: 'assistant', content: JSON.stringify(seedMessage) }
  ]);
  const [inputText, setInputText] = useState('');
  const [loading, setLoading] = useState(false);
  const [selectedOption, setSelectedOption] = useState<string | null>(null);
  const [toggleValues, setToggleValues] = useState<Record<string, boolean>>({});
  const [breadcrumb, setBreadcrumb] = useState<string[]>([]);

  const lastAssistantMessage = useMemo(() => {
    const lastMsg = messages[messages.length - 1];
    if (lastMsg?.role === 'assistant') {
      try {
        return JSON.parse(lastMsg.content) as AssistantResponse;
      } catch {
        return null;
      }
    }
    return null;
  }, [messages]);

  const sendMessage = useCallback(async (content: string) => {
    setLoading(true);
    try {
      const response = await fetch(`${BACKEND_BASE_URL}/api/chat`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          messages: [...messages, { role: 'user', content }],
        }),
      });

      if (!response.ok) {
        throw new Error('Failed to get response');
      }

      const data = await response.json();
      setMessages(prev => [...prev, { role: 'user', content }, { role: 'assistant', content: JSON.stringify(data) }]);
      
      // Update breadcrumb
      if (data.step !== undefined) {
        setBreadcrumb(prev => {
          const newBreadcrumb = [...prev];
          while (newBreadcrumb.length > data.step) {
            newBreadcrumb.pop();
          }
          return newBreadcrumb;
        });
      }
      
      setSelectedOption(null);
      setToggleValues({});
    } catch (error) {
      console.error('Error:', error);
      setMessages(prev => [...prev, { role: 'user', content }, { role: 'assistant', content: JSON.stringify({
        message: "Something went wrong. Please try again.",
        helper: "",
        inputType: "text",
        allowFreeText: true,
        step: lastAssistantMessage?.step || 0,
      }) }]);
    } finally {
      setLoading(false);
    }
  }, [messages, lastAssistantMessage]);

  const handleOptionClick = (value: string) => {
    setSelectedOption(value);
    sendMessage(value);
  };

  const handleToggleChange = (key: string, value: boolean) => {
    setToggleValues(prev => ({ ...prev, [key]: value }));
  };

  const handleConfigSubmit = (values: Record<string, string>) => {
    const configStr = Object.entries(values)
      .map(([k, v]) => `${k}: ${v}`)
      .join(', ');
    sendMessage(configStr);
  };

  const handleReset = () => {
    setMessages([{ role: 'assistant', content: JSON.stringify(seedMessage) }]);
    setSelectedOption(null);
    setToggleValues({});
    setBreadcrumb([]);
    setInputText('');
  };

  const handleBack = () => {
    if (messages.length > 1) {
      setMessages(prev => prev.slice(0, -2));
      setSelectedOption(null);
      setToggleValues({});
    }
  };

  const handleCopy = (text: string) => {
    navigator.clipboard.writeText(text);
  };

  const currentStep = lastAssistantMessage?.step || 0;

  return (
    <ErrorBoundary fallback={
      <div style={{ padding: '20px', color: '#fff' }}>
        <div style={{ fontSize: '16px', fontWeight: 600, marginBottom: '8px' }}>Something went wrong</div>
        <div style={{ fontSize: '14px', color: 'rgba(255,255,255,0.6)', marginBottom: '16px' }}>
          The plugin encountered an error. Please try refreshing.
        </div>
        <button
          style={{
            padding: '12px 24px',
            background: 'linear-gradient(135deg, #a855f7, #ec4899)',
            border: 'none',
            borderRadius: '8px',
            color: '#fff',
            fontSize: '14px',
            fontWeight: 600,
            cursor: 'pointer',
          }}
          onClick={handleReset}
        >
          Start Over
        </button>
      </div>
    }>
      <div style={{ padding: '20px', height: '100vh', display: 'flex', flexDirection: 'column' }}>
        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
          <div>
            <div style={{ fontSize: '16px', fontWeight: 700, color: '#fff' }}>S1 Hero Prompt Engine</div>
            <div style={{ fontSize: '12px', color: 'rgba(255,255,255,0.5)' }}>AI-Powered Art Direction</div>
          </div>
          <button
            style={{
              width: '32px',
              height: '32px',
              borderRadius: '8px',
              backgroundColor: '#1a1a22',
              border: 'none',
              color: 'rgba(255,255,255,0.6)',
              fontSize: '18px',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
            onClick={() => window.parent.postMessage({ type: 'close' }, '*')}
          >
            ×
          </button>
        </div>

        {/* Progress Bar */}
        <div style={{ display: 'flex', gap: '4px', marginBottom: '16px' }}>
          {[0, 1, 2, 3, 4, 5].map((step) => (
            <div
              key={step}
              style={{
                flex: 1,
                height: '4px',
                borderRadius: '2px',
                background: step <= currentStep
                  ? 'linear-gradient(90deg, #a855f7, #ec4899)'
                  : 'rgba(255,255,255,0.06)',
              }}
            />
          ))}
        </div>

        {/* Breadcrumb */}
        {breadcrumb.length > 0 && (
          <div style={{ display: 'flex', gap: '8px', marginBottom: '16px', flexWrap: 'wrap' }}>
            {breadcrumb.map((item, index) => (
              <span
                key={index}
                style={{
                  fontSize: '11px',
                  padding: '4px 8px',
                  borderRadius: '4px',
                  backgroundColor: '#1a1a22',
                  color: 'rgba(255,255,255,0.7)',
                }}
              >
                {item}
              </span>
            ))}
          </div>
        )}

        {/* Back and Reset buttons */}
        <div style={{ display: 'flex', gap: '8px', marginBottom: '16px' }}>
          {currentStep > 0 && (
            <button
              style={{
                padding: '8px 16px',
                backgroundColor: '#1a1a22',
                border: '1px solid rgba(255,255,255,0.1)',
                borderRadius: '8px',
                color: '#fff',
                fontSize: '12px',
                fontWeight: 600,
                cursor: 'pointer',
              }}
              onClick={handleBack}
            >
              ← Back
            </button>
          )}
          <button
            style={{
              padding: '8px 16px',
              backgroundColor: '#1a1a22',
              border: '1px solid rgba(255,255,255,0.1)',
              borderRadius: '8px',
              color: '#fff',
              fontSize: '12px',
              fontWeight: 600,
              cursor: 'pointer',
            }}
            onClick={handleReset}
          >
            Reset
          </button>
        </div>

        {/* Content */}
        <div style={{ flex: 1, overflowY: 'auto' }}>
          {loading ? (
            <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '200px' }}>
              <div style={{ color: 'rgba(255,255,255,0.6)' }}>Loading...</div>
            </div>
          ) : lastAssistantMessage ? (
            <div>
              <div style={{ fontSize: '18px', fontWeight: 600, color: '#fff', marginBottom: '8px' }}>
                {lastAssistantMessage.message}
              </div>
              {lastAssistantMessage.helper && (
                <div style={{ fontSize: '14px', color: 'rgba(255,255,255,0.6)', marginBottom: '20px' }}>
                  {lastAssistantMessage.helper}
                </div>
              )}

              {lastAssistantMessage.inputType === 'cards' && lastAssistantMessage.options && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                  {lastAssistantMessage.options.map((option) => (
                    <CardOption
                      key={option.value}
                      option={option}
                      selected={selectedOption === option.value}
                      onClick={() => handleOptionClick(option.value)}
                      disabled={loading}
                    />
                  ))}
                </div>
              )}

              {lastAssistantMessage.inputType === 'toggles' && lastAssistantMessage.toggles && (
                <div>
                  {lastAssistantMessage.toggles.map((toggle) => (
                    <Toggle
                      key={toggle.key}
                      toggle={toggle}
                      value={toggleValues[toggle.key] ?? toggle.default}
                      onChange={(value) => handleToggleChange(toggle.key, value)}
                    />
                  ))}
                  <button
                    style={{
                      width: '100%',
                      padding: '14px',
                      marginTop: '16px',
                      background: 'linear-gradient(135deg, #a855f7, #ec4899)',
                      border: 'none',
                      borderRadius: '12px',
                      color: '#fff',
                      fontSize: '14px',
                      fontWeight: 600,
                      cursor: 'pointer',
                    }}
                    onClick={() => sendMessage(JSON.stringify(toggleValues))}
                  >
                    Continue →
                  </button>
                </div>
              )}

              {lastAssistantMessage.inputType === 'config_form' && lastAssistantMessage.fields && (
                <ConfigForm
                  fields={lastAssistantMessage.fields}
                  onSubmit={handleConfigSubmit}
                />
              )}

              {lastAssistantMessage.inputType === 'result' && lastAssistantMessage.finalPrompt && (
                <ResultScreen
                  finalPrompt={lastAssistantMessage.finalPrompt}
                  onCopy={() => handleCopy(lastAssistantMessage.finalPrompt!)}
                  onReset={handleReset}
                />
              )}
            </div>
          ) : (
            <div style={{ color: 'rgba(255,255,255,0.6)' }}>No response</div>
          )}
        </div>

        {/* Text Input */}
        {(lastAssistantMessage?.inputType === 'text' || lastAssistantMessage?.allowFreeText) && (
          <div style={{ marginTop: '16px' }}>
            <textarea
              style={{
                width: '100%',
                padding: '12px',
                backgroundColor: '#1a1a22',
                border: '1px solid rgba(255,255,255,0.1)',
                borderRadius: '12px',
                color: '#fff',
                fontSize: '14px',
                fontFamily: 'inherit',
                resize: 'none',
                minHeight: '80px',
              }}
              placeholder="Type your response..."
              value={inputText}
              onChange={(e) => setInputText(e.target.value)}
              disabled={loading}
            />
            <button
              style={{
                width: '100%',
                padding: '14px',
                marginTop: '8px',
                background: 'linear-gradient(135deg, #a855f7, #ec4899)',
                border: 'none',
                borderRadius: '12px',
                color: '#fff',
                fontSize: '14px',
                fontWeight: 600,
                cursor: 'pointer',
              }}
              onClick={() => {
                if (inputText.trim()) {
                  sendMessage(inputText);
                  setInputText('');
                }
              }}
              disabled={loading || !inputText.trim()}
            >
              Send
            </button>
          </div>
        )}
      </div>
    </ErrorBoundary>
  );
}
