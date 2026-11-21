# Hairline UI components

VoiceOrb and its audio/motion helpers are copied from the official Hairline UI registry under its MIT component license. ToolCall and StreamingText are adapted from the same library for Nool's tokens, native disclosure, and reduced-motion requirements.

Sources: https://hairlineui.com/ui/voice-orb, https://hairlineui.com/ui/tool-call, https://hairlineui.com/ui/streaming-answer, https://hairlineui.com/ui/theme-toggle.

Nool uses Agora for all microphone/session transport. Hairline's alternative recording/session utilities are not installed. The orb is static while idle and receives real RTC input/output levels during a conversation. No visual animation starts a provider session.
