"""
Real-Time Hybrid Call Quality Scoring System
Evaluates call transcripts using rule-based + LLM hybrid approach
No ML training - direct scoring pipeline
"""

import re
import json
import time
from typing import Dict, List, Tuple
from openai import OpenAI


# ============================================================================
# Configuration
# ============================================================================

import os
from dotenv import load_dotenv

load_dotenv()

OPENROUTER_API_KEY = os.getenv("OPENROUTER_API_KEY", "[OPENROUTER_API_KEY]")
OPENROUTER_MODEL = "openai/gpt-4o-mini"

# Hybrid weighting: rule_weight + llm_weight = 1.0
EMPATHY_WEIGHTS = {"rule": 0.40, "llm": 0.60}
PROFESSIONALISM_WEIGHTS = {"rule": 0.50, "llm": 0.50}
COMPLIANCE_WEIGHTS = {"rule": 0.45, "llm": 0.55}

# Final quality score weights (must sum to 1.0)
FINAL_WEIGHTS = {
    "empathy": 0.35,
    "professionalism": 0.30,
    "compliance": 0.35
}


# ============================================================================
# Rule-Based Scoring Functions
# ============================================================================

def score_empathy_rules(transcript: str) -> Tuple[float, List[str]]:
    """
    Score empathy using keyword matching (0-20 scale).
    
    Returns:
        (score, detected_phrases)
    """
    empathy_keywords = {
        'i understand': 5,
        'i apologize': 4,
        'i appreciate': 3,
        'thank you for': 3,
        'i hear you': 4,
        "i'm sorry": 5,
        'that must be': 3,
        'i can imagine': 4,
        'i recognize': 3,
        'i see your concern': 4,
        'i completely understand': 5,
        'that sounds frustrating': 4,
        'i would feel the same': 5
    }
    
    score = 0
    detected = []
    transcript_lower = transcript.lower()
    
    for phrase, points in empathy_keywords.items():
        if phrase in transcript_lower:
            score += points
            detected.append(phrase)
    
    # Cap at 20
    score = min(score, 20)
    
    return score, detected


def score_professionalism_rules(transcript: str) -> Tuple[float, List[str]]:
    """
    Score professionalism using penalty-based detection (0-20 scale).
    Starts at 20, deducts for violations.
    
    Returns:
        (score, violations)
    """
    score = 20
    violations = []
    transcript_lower = transcript.lower()
    
    # Profanity check (-10 points)
    profanity = ['damn', 'hell', 'crap', 'stupid', 'idiot', 'sucks', 'hate']
    for word in profanity:
        if word in transcript_lower:
            score -= 10
            violations.append(f"Profanity detected: '{word}'")
            break  # One violation counts
    
    # Slang/informal language (-2 per occurrence, max -6)
    slang = ['gonna', 'wanna', 'yeah yeah', 'nah', 'kinda', 'dunno', 'gotta']
    slang_count = 0
    for s in slang:
        if s in transcript_lower:
            slang_count += 1
            violations.append(f"Informal language: '{s}'")
    
    slang_penalty = min(slang_count * 2, 6)
    score -= slang_penalty
    
    # Aggressive/dismissive phrases (-7 points)
    aggressive = [
        'you need to', 'you should have', 'listen to me', 
        'calm down', 'not my problem', 'nothing i can do',
        'policy says', 'just follow'
    ]
    for phrase in aggressive:
        if phrase in transcript_lower:
            score -= 7
            violations.append(f"Aggressive tone: '{phrase}'")
            break
    
    # Floor at 0
    score = max(score, 0)
    
    return score, violations


def score_compliance_rules(transcript: str) -> Tuple[float, List[str]]:
    """
    Score compliance based on protocol requirements (0-20 scale).
    
    Returns:
        (score, met_requirements)
    """
    score = 0
    met_requirements = []
    transcript_lower = transcript.lower()
    
    # Order number confirmation (8 points)
    order_patterns = [
        r'order\s*#?\s*\d{5,}',
        r'confirmation\s*#?\s*\d{5,}',
        r'order number\s*\d{5,}',
        r'reference\s*#?\s*\d{5,}'
    ]
    if any(re.search(pattern, transcript_lower) for pattern in order_patterns):
        score += 8
        met_requirements.append("Order number confirmed")
    
    # Product number validation (6 points)
    product_patterns = [
        r'product\s*#?\s*[A-Z0-9]{4,}',
        r'sku\s*#?\s*[A-Z0-9]{4,}',
        r'item\s*#?\s*[A-Z0-9]{4,}',
        r'model\s*#?\s*[A-Z0-9]{4,}'
    ]
    if any(re.search(pattern, transcript_lower) for pattern in product_patterns):
        score += 6
        met_requirements.append("Product identifier validated")
    
    # Resolution statement (6 points)
    resolution_phrases = [
        'i will', 'we will', 'i have', 'resolved', 
        'escalated', 'submitted ticket', 'follow up',
        'send you', 'process', 'arranged', 'scheduled'
    ]
    if any(phrase in transcript_lower for phrase in resolution_phrases):
        score += 6
        met_requirements.append("Resolution action stated")
    
    return score, met_requirements


# ============================================================================
# LLM Evaluation Layer
# ============================================================================

def evaluate_with_llm(transcript: str, max_retries: int = 2) -> Dict:
    """
    Evaluate transcript using LLM with structured JSON output.
    Falls back to neutral scores if API key is invalid or unavailable.
    
    Returns:
        {
            'empathy_score': float (0-20),
            'professionalism_score': float (0-20),
            'compliance_score': float (0-20),
            'violations': List[str],
            'improvements': List[str]
        }
    """
    
    # Check if API key is valid
    if not OPENROUTER_API_KEY or OPENROUTER_API_KEY == "[OPENROUTER_API_KEY]":
        print("⚠️  WARNING: OpenRouter API key not set. Using rule-based scoring only.")
        print("💡 To use LLM evaluation, set OPENROUTER_API_KEY in .env file")
        return {
            'empathy_score': 10.0,
            'professionalism_score': 10.0,
            'compliance_score': 10.0,
            'language_detected': 'Unknown',
            'language_proficiency_score': None,
            'efficiency_score': None,
            'bias_reduction_score': None,
            'customer_emotion': 'Unknown',
            'sales_opportunity_score': None,
            'violations': [],
            'improvements': ['Set OPENROUTER_API_KEY in .env to enable LLM evaluation']
        }
    
    client = OpenAI(
        api_key=OPENROUTER_API_KEY,
        base_url="https://openrouter.ai/api/v1"
    )
    
    prompt = f"""
You are the AI evaluation engine powering an enterprise SaaS platform called EchoScore.

Your job is to analyze a customer service call transcript and return a structured, objective quality evaluation.

Analyze carefully and return ONLY valid JSON.

TRANSCRIPT:
{transcript[:3500]}

Return EXACTLY this JSON structure:

{{
  "empathy_score": number (0-20),
  "professionalism_score": number (0-20),
  "compliance_score": number (0-20),

  "language_detected": string,
  "language_proficiency_score": number (0-100),

  "efficiency_score": number (0-100),
  "bias_reduction_score": number (0-100),
  "customer_emotion": string,
  "sales_opportunity_score": number (0-100),

  "violations": [string],
  "improvements": [string]
}}

────────────────────────
EVALUATION CRITERIA
────────────────────────

1) Empathy (0-20)
- Acknowledges customer emotions
- Validates concerns
- Shows understanding
- Expresses care or apology when appropriate

2) Professionalism (0-20)
- Respectful tone
- Clear articulation
- No slang or profanity
- Maintains composure

3) Compliance (0-20)
- Confirms order/account details
- Validates product information
- States resolution clearly
- Provides next steps

4) Language Detection
- Detect the dominant language spoken in the transcript.

5) Language Proficiency (0-100)
Evaluate the agent's language quality:
- Grammar accuracy
- Sentence clarity
- Professional vocabulary
- Structured communication
- Fluency and articulation

6) Efficiency (0-100)
Evaluate how efficiently the issue was handled:
- Directness of response
- Avoidance of repetition
- Clear resolution path
- Logical flow
- Minimal unnecessary conversation

7) Bias Reduction (0-100)
Evaluate fairness and neutrality:
- No discriminatory remarks
- No assumptions
- Equal treatment
- Neutral tone

8) Customer Emotion
Classify dominant customer emotion as one of:
Happy
Neutral
Frustrated
Angry
Confused

9) Sales Opportunity (0-100)
Evaluate:
- Identifies upsell/cross-sell opportunities
- Proactive value suggestions
- Mentions upgrades or benefits
- Recognizes opportunity signals

────────────────────────
IMPORTANT RULES
────────────────────────

- Be objective and strict.
- Do not inflate scores.
- Do not output explanations.
- Do not include markdown.
- Return ONLY raw JSON.
- All numeric fields must be numbers.
- Scores must stay within defined ranges.
- If something is not present, score conservatively.

Return JSON only.
"""

    for attempt in range(max_retries + 1):
        try:
            response = client.chat.completions.create(
                model=OPENROUTER_MODEL,
                messages=[{"role": "user", "content": prompt}],
                temperature=0.2,
                max_tokens=400
            )
            
            content = response.choices[0].message.content.strip()
            
            # Extract JSON from markdown fences if present
            if "```json" in content:
                content = content.split("```json")[1].split("```")[0].strip()
            elif "```" in content:
                content = content.split("```")[1].split("```")[0].strip()
            
            # Parse JSON
            result = json.loads(content)
            
            # Validate required keys
            required = [
                'empathy_score', 'professionalism_score', 'compliance_score',
                'language_detected', 'language_proficiency_score',
                'efficiency_score', 'bias_reduction_score',
                'customer_emotion', 'sales_opportunity_score',
                'violations', 'improvements'
            ]
            missing = [k for k in required if k not in result]
            if missing:
                raise ValueError(f"Missing required keys: {missing}")

            # Validate and clamp 0-20 scores
            for key in ['empathy_score', 'professionalism_score', 'compliance_score']:
                result[key] = max(0.0, min(20.0, float(result[key])))

            # Validate and clamp 0-100 scores; preserve None as None
            for key in ['language_proficiency_score', 'efficiency_score',
                        'bias_reduction_score', 'sales_opportunity_score']:
                raw = result.get(key)
                if raw is None or (isinstance(raw, float) and raw != raw):  # None or NaN
                    result[key] = None
                else:
                    result[key] = max(0.0, min(100.0, float(raw)))

            # Ensure string fields
            result['language_detected'] = str(result.get('language_detected') or 'Unknown')
            result['customer_emotion'] = str(result.get('customer_emotion') or 'Unknown')

            # Ensure lists
            result['violations'] = list(result['violations']) if result['violations'] else []
            result['improvements'] = list(result['improvements']) if result['improvements'] else []

            return result
            
        except (json.JSONDecodeError, ValueError, KeyError, TypeError) as e:
            print(f"[Attempt {attempt + 1}/{max_retries + 1}] LLM parse error: {e}")
            
            if attempt < max_retries:
                time.sleep(1)
                continue
            else:
                # Fallback to neutral scores
                print("⚠️  LLM evaluation failed. Using fallback neutral scores.")
                return {
                    'empathy_score': 10.0,
                    'professionalism_score': 10.0,
                    'compliance_score': 10.0,
                    'language_detected': 'Unknown',
                    'language_proficiency_score': None,
                    'efficiency_score': None,
                    'bias_reduction_score': None,
                    'customer_emotion': 'Unknown',
                    'sales_opportunity_score': None,
                    'violations': [],
                    'improvements': ['LLM evaluation unavailable - rule-based scoring used']
                }
        
        except Exception as e:
            print(f"[Attempt {attempt + 1}/{max_retries + 1}] Unexpected error: {e}")
            if attempt >= max_retries:
                return {
                    'empathy_score': 10.0,
                    'professionalism_score': 10.0,
                    'compliance_score': 10.0,
                    'language_detected': 'Unknown',
                    'language_proficiency_score': None,
                    'efficiency_score': None,
                    'bias_reduction_score': None,
                    'customer_emotion': 'Unknown',
                    'sales_opportunity_score': None,
                    'violations': [],
                    'improvements': ['Error contacting API - rule-based scoring used']
                }


# ============================================================================
# Hybrid Aggregation
# ============================================================================

def hybrid_aggregate(rule_score: float, llm_score: float, weights: Dict[str, float]) -> float:
    """
    Combine rule-based and LLM scores using weighted average.
    Scales to 0-100.
    
    Args:
        rule_score: Rule-based score (0-20)
        llm_score: LLM score (0-20)
        weights: {'rule': w1, 'llm': w2} where w1+w2=1.0
    
    Returns:
        Aggregated score (0-100)
    """
    # Normalize to 0-1 scale
    rule_norm = rule_score / 20.0
    llm_norm = llm_score / 20.0
    
    # Weighted average
    combined = (rule_norm * weights['rule']) + (llm_norm * weights['llm'])
    
    # Scale to 0-100 and clamp
    final = combined * 100
    return max(0.0, min(100.0, round(final, 1)))


def compute_final_quality_score(empathy: float, professionalism: float, 
                                compliance: float, weights: Dict[str, float]) -> float:
    """
    Compute overall quality score from dimension scores.
    
    Args:
        empathy, professionalism, compliance: Scores (0-100)
        weights: {'empathy': w1, 'professionalism': w2, 'compliance': w3}
    
    Returns:
        Final quality score (0-100)
    """
    score = (empathy * weights['empathy'] + 
             professionalism * weights['professionalism'] + 
             compliance * weights['compliance'])
    
    return max(0.0, min(100.0, round(score, 1)))


# ============================================================================
# Main Evaluation Pipeline
# ============================================================================

def evaluate_call_quality(transcript: str, verbose: bool = True) -> Dict:
    """
    Main evaluation pipeline for a single call transcript.
    
    Args:
        transcript: Call transcript text
        verbose: Print detailed breakdown
    
    Returns:
        {
            'empathy_score': float,
            'professionalism_score': float,
            'compliance_score': float,
            'quality_score': float,
            'violations': List[str],
            'improvements': List[str],
            'breakdown': {
                'rule_based': {...},
                'llm_based': {...}
            }
        }
    """
    if verbose:
        print("=" * 70)
        print("CALL QUALITY EVALUATION")
        print("=" * 70)
    
    # Step 1: Rule-based scoring
    if verbose:
        print("\n[1/3] Running rule-based analysis...")
    
    rule_empathy, empathy_phrases = score_empathy_rules(transcript)
    rule_prof, prof_violations = score_professionalism_rules(transcript)
    rule_comp, comp_requirements = score_compliance_rules(transcript)
    
    if verbose:
        print(f"  ✓ Empathy: {rule_empathy}/20")
        print(f"  ✓ Professionalism: {rule_prof}/20")
        print(f"  ✓ Compliance: {rule_comp}/20")
    
    # Step 2: LLM evaluation
    if verbose:
        print("\n[2/3] Calling LLM for semantic analysis...")
    
    llm_result = evaluate_with_llm(transcript)
    
    if verbose:
        print(f"  ✓ Empathy: {llm_result['empathy_score']}/20")
        print(f"  ✓ Professionalism: {llm_result['professionalism_score']}/20")
        print(f"  ✓ Compliance: {llm_result['compliance_score']}/20")
    
    # Step 3: Hybrid aggregation
    if verbose:
        print("\n[3/3] Computing hybrid scores...")
    
    empathy_final = hybrid_aggregate(
        rule_empathy, 
        llm_result['empathy_score'], 
        EMPATHY_WEIGHTS
    )
    
    professionalism_final = hybrid_aggregate(
        rule_prof, 
        llm_result['professionalism_score'], 
        PROFESSIONALISM_WEIGHTS
    )
    
    compliance_final = hybrid_aggregate(
        rule_comp, 
        llm_result['compliance_score'], 
        COMPLIANCE_WEIGHTS
    )
    
    quality_final = compute_final_quality_score(
        empathy_final, 
        professionalism_final, 
        compliance_final,
        FINAL_WEIGHTS
    )
    
    # Compile violations and improvements
    all_violations = prof_violations + llm_result['violations']
    all_improvements = llm_result['improvements']
    
    # Add rule-based improvement suggestions
    if rule_empathy < 10:
        all_improvements.insert(0, "Use more empathy phrases (e.g., 'I understand', 'I apologize')")
    if rule_comp < 10:
        all_improvements.insert(0, "Confirm order/product numbers and state clear resolution")
    
    result = {
        'empathy_score': empathy_final,
        'professionalism_score': professionalism_final,
        'compliance_score': compliance_final,
        'quality_score': quality_final,
        # LLM-only evaluated metrics (None means not evaluated)
        'language_detected': llm_result.get('language_detected', 'Unknown'),
        'language_proficiency_score': llm_result.get('language_proficiency_score'),
        'efficiency_score': llm_result.get('efficiency_score'),
        'bias_reduction_score': llm_result.get('bias_reduction_score'),
        'customer_emotion': llm_result.get('customer_emotion', 'Unknown'),
        'sales_opportunity_score': llm_result.get('sales_opportunity_score'),
        'violations': all_violations,
        'improvements': all_improvements,
        'breakdown': {
            'rule_based': {
                'empathy': rule_empathy,
                'professionalism': rule_prof,
                'compliance': rule_comp,
                'detected_empathy': empathy_phrases,
                'detected_violations': prof_violations,
                'met_requirements': comp_requirements
            },
            'llm_based': {
                'empathy': llm_result['empathy_score'],
                'professionalism': llm_result['professionalism_score'],
                'compliance': llm_result['compliance_score']
            }
        }
    }
    
    if verbose:
        print_results(result)
    
    return result


def print_results(result: Dict):
    """Pretty-print evaluation results."""
    print("\n" + "=" * 70)
    print("FINAL RESULTS")
    print("=" * 70)
    
    def get_grade(score):
        if score >= 90: return "A (Excellent)"
        elif score >= 80: return "B (Good)"
        elif score >= 70: return "C (Satisfactory)"
        elif score >= 60: return "D (Needs Improvement)"
        else: return "F (Poor)"
    
    print(f"\n📊 QUALITY SCORE: {result['quality_score']}/100 - {get_grade(result['quality_score'])}")
    print("\nDimension Scores:")
    print(f"  • Empathy:             {result['empathy_score']}/100")
    print(f"  • Professionalism:     {result['professionalism_score']}/100")
    print(f"  • Compliance:          {result['compliance_score']}/100")
    print(f"  • Language Proficiency:{result.get('language_proficiency_score', 'N/A')}")
    print(f"  • Efficiency:          {result.get('efficiency_score', 'N/A')}")
    print(f"  • Bias Reduction:      {result.get('bias_reduction_score', 'N/A')}")
    print(f"  • Sales Opportunity:   {result.get('sales_opportunity_score', 'N/A')}")
    print(f"\nLanguage: {result.get('language_detected', 'Unknown')}")
    print(f"Customer Emotion: {result.get('customer_emotion', 'Unknown')}") 
    
    if result['violations']:
        print("\n⚠️  VIOLATIONS:")
        for v in result['violations']:
            print(f"  - {v}")
    
    if result['improvements']:
        print("\n💡 SUGGESTED IMPROVEMENTS:")
        for i in result['improvements']:
            print(f"  - {i}")
    
    print("\n" + "=" * 70)


# ============================================================================
# Example Usage
# ============================================================================

if __name__ == "__main__":
    
    # Example call 1: Good quality
    transcript_1 = """
    Agent: Thank you for calling customer support. My name is Sarah. How can I help you today?
    Customer: Hi, I ordered a product last week and it hasn't arrived yet.
    Agent: I completely understand your concern. Let me look into that for you right away. 
    May I have your order number please?
    Customer: Sure, it's order #847562.
    Agent: Thank you. I've located your order for product SKU #A4729. I see it was shipped 
    on the 15th and should have arrived by now. I sincerely apologize for the delay. 
    Let me check the tracking information.
    Customer: Okay, thank you.
    Agent: I can see the package is currently at your local distribution center. I will 
    escalate this with our shipping partner to ensure it's delivered to you by tomorrow. 
    I've also added a note to your account, and you'll receive an email confirmation shortly.
    Is there anything else I can help you with today?
    Customer: No, that's all. Thank you for your help.
    Agent: You're very welcome. I appreciate your patience. Have a great day!
    """
    
    # Example call 2: Poor quality
    transcript_2 = """
    Agent: Yeah, support, what do you need?
    Customer: Hi, I have a problem with my order.
    Agent: Okay, what's the issue?
    Customer: It hasn't arrived and it's been two weeks.
    Agent: Well, you should have gotten tracking info. Did you check your email?
    Customer: Yes, but the tracking says it's lost.
    Agent: That's not my problem. You gotta contact the shipping company.
    Customer: But you're customer support!
    Agent: Listen to me, I can't do anything about shipping. Just call them.
    Customer: This is ridiculous.
    Agent: Whatever, is there anything else? I have other calls.
    """
    
    print("\n\n" + "█" * 70)
    print("EVALUATING CALL #1 (Expected: High Quality)")
    print("█" * 70)
    result_1 = evaluate_call_quality(transcript_1, verbose=True)
    
    print("\n\n" + "█" * 70)
    print("EVALUATING CALL #2 (Expected: Low Quality)")
    print("█" * 70)
    result_2 = evaluate_call_quality(transcript_2, verbose=True)
    
    # Export results as JSON
    import json
    with open('call_evaluation_results.json', 'w') as f:
        json.dump({
            'call_1': result_1,
            'call_2': result_2
        }, f, indent=2)
    
    print("\n✅ Results exported to 'call_evaluation_results.json'")