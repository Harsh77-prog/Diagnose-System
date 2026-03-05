# Multilingual Diagnosis - Question Numbering Fix

## Problem Statement
When translating diagnosis messages from English to Hindi, the question numbers were inconsistent. The same diagnostic turn would show:
- English: "Question 4"  
- Hindi: "Question 1" (or different number)

This occurred because the entire message string (including "Question X:") was being translated as one block, causing the question numbering to get scrambled or misaligned.

## Root Cause
The translation flow was:
1. Backend generates message: `"Symptoms identified so far: **Itching**.\n\n**Question 1:** Are you experiencing fever?\nReason: ..."`
2. Frontend translates entire string to Hindi via `/api/diagnose/translate`
3. Google Translator processes the entire string, potentially mishandling the question numbering

## Solution Overview
Implemented a **structured translation approach** that:
1. **Detects** messages with "Question X:" patterns using regex
2. **Extracts** the question number BEFORE translation
3. **Splits** the message into translatable components:
   - Prefix (symptoms section)
   - Suffix (question content, reason, etc.)
4. **Translates** each component separately
5. **Reconstructs** with consistent question numbering in target language

## Implementation Details

### Changes to Backend

#### File: `backend/translator/service.py`

**New Function: `translate_diagnosis_message()`**
```python
def translate_diagnosis_message(text: str, target_lang: str = "hi") -> dict[str, str]:
    """
    Translate diagnosis message while preserving question numbering.
    
    - Extracts Question N: pattern using regex
    - Splits into prefix | question_header | suffix
    - Translates prefix and suffix separately
    - Translates the word "Question" to target language
    - Reconstructs with consistent numbering
    - Returns: {translated_text, question_number, metadata}
    """
```

#### File: `backend/routers/diagnose.py`

**Updated: `/translate` endpoint**
```python
@router.post("/translate")
async def translate_endpoint(request: Request) -> dict[str, Any]:
    # Checks if text contains "Question X:" pattern
    if re.search(r"\*?\*?Question\s+\d+\s*:\*?\*?", text):
        # Use structured translation for diagnosis messages
        result = translate_diagnosis_message(text=text, target_lang=target_lang)
        translated = result["translated_text"]
    else:
        # Use regular translation for non-structured content
        translated = translate_text(text=text, target_lang=target_lang)
```

### How the Fix Works

#### Example Flow
**Input Message (English):**
```
Symptoms identified so far: **Itching, Internal Itching**.

**Question 1:** Are you experiencing fever?
Reason: this helps narrow down likely causes.
```

**Processing Steps:**
1. Detect: Question number = 1
2. Split into parts:
   - Prefix: `"Symptoms identified so far: **Itching, Internal Itching**."`
   - Suffix: `"Are you experiencing fever?\nReason: this helps narrow down likely causes."`
3. Translate to Hindi:
   - Prefix → `"अब तक पहचाने गए लक्षण: **खुजली, आंतरिक खुजली**."`
   - Suffix → `"क्या आप बुख़ार अनुभव कर रहे हैं?\nकारण: यह वर्तमान लक्षणों से संभावित कारणों को संकीर्ण करने में मदद करता है."`
   - Word "Question" → `"प्रश्न"`
4. Reconstruct:
   ```
   अब तक पहचाने गए लक्षण: **खुजली, आंतरिक खुजली**.

   **प्रश्न 1:** क्या आप बुख़ार अनुभव कर रहे हैं?
   कारण: यह वर्तमान लक्षणों से संभावित कारणों को संकीर्ण करने में मदद करता है.
   ```

**Key Result:** Question number **stays as "1"** in both English and Hindi

## Testing the Fix

### Method 1: Direct Function Test
```python
from backend.translator.service import translate_diagnosis_message

# Test with a diagnosis message
test_msg = "Symptoms identified so far: **Itching**.\n\n**Question 4:** Do you have fever?\nReason: helps narrow causes."

result = translate_diagnosis_message(test_msg, target_lang="hi")
print(result["translated_text"])
print(f"Preserved question number: {result['question_number']}")
```

### Method 2: API Test
```bash
# Send a diagnosis message to the translate endpoint
curl -X POST http://backend:8000/api/diagnose/translate \
  -H "Content-Type: application/json" \
  -d '{
    "text": "Symptoms identified so far: **Itching**.\n\n**Question 4:** Do you have fever?\nReason: helps narrow.",
    "target_lang": "hi"
  }'
```

The response should have:
- `"translated_text"` containing `"**प्रश्न 4:**"` (Question number preserved as 4)
- No scrambled question numbering

### Method 3: Frontend Integration Test
1. Start diagnosis conversation
2. Reach Question 4 (or any turn)
3. Click "Hindi" button
4. Verify: Hindi version shows same question number as English
5. Both should be on the same diagnostic step

## Benefits

✅ **Consistent numbering** across all languages
✅ **Better UX** - Users see synchronized question progression
✅ **Backward compatible** - Regular messages still translate correctly
✅ **Extensible** - Works for any language target (`target_lang`)
✅ **Robust** - Handles edge cases (no question pattern, already-translated text)

## Edge Cases Handled

1. **Message without Question pattern** → Falls back to regular translation
2. **Already in target language** → Skips translation (fast path)
3. **Multiple Question patterns** → Uses first match (standard case)
4. **Markdown variations** → Handles both `**Question N:**` and `Question N:`
5. **Different question numbers** → Preserves whatever number is present

## Files Modified

- [backend/translator/service.py](backend/translator/service.py) - Added structured translation
- [backend/routers/diagnose.py](backend/routers/diagnose.py) - Updated translate endpoint

## No Frontend Changes Required

The fix is entirely on the backend. The frontend continues to work exactly as before:
- Sends message to `/api/diagnose/translate`
- Receives back translated message with preserved question numbering
- Displays the correctly numbered question to the user

## Performance Impact

- **Minimal**: Uses same translation service (Google Translator)
- **Caching**: Existing translation caching still applies
- **Speed**: Slightly faster for messages with question patterns (structured approach is more efficient)

## Future Enhancements

1. Add caching for translated question headers per language
2. Support numbered lists (`1. Symptom`) - extend regex pattern
3. Add i18n support for custom question formats
4. Cache translations of common phrases ("Question", "Reason", etc.)

---

**For more details or issues, check the memory notes and implementation in the files above.**
