Refine the user's raw prompt into a clear, structured instruction, then execute it.

## Input

$ARGUMENTS

## Steps

### 1 - Analyze the raw prompt

Evaluate the input across these dimensions:

| Dimension | Question |
|-----------|----------|
| **Goal** | What is the user actually trying to accomplish? |
| **Ambiguity** | What words or phrases could be interpreted multiple ways? |
| **Missing context** | What assumptions am I making that should be explicit? |
| **Scope** | Is this too broad? Too narrow? What boundaries are needed? |
| **Output format** | What form should the result take? (code, explanation, list, file, etc.) |
| **Constraints** | Are there technology, style, or domain constraints implied but unstated? |
| **Success criteria** | How will the user know the result is correct? |

### 2 - Check if refinement is needed

If the prompt is already clear, specific, and actionable (specifies exact files, has concrete success criteria, uses precise technical language) - say "Your prompt is already clear - executing as-is." and skip to step 4.

### 3 - Present the refined prompt

Restructure using this format (omit sections that don't apply):

```
## Goal
[One sentence: what exactly needs to happen]

## Context
[Background needed - project state, tech stack, relevant files]

## Requirements
- [Concrete, testable requirement 1]
- [Concrete, testable requirement 2]

## Constraints
- [Technology, style, or scope boundaries]

## Output format
[What the result should look like]

## Out of scope
[What this task is NOT]
```

Rules:
- Replace vague words ("improve", "fix", "make better") with specific actions
- Convert implicit assumptions into explicit requirements
- If the prompt references files or code, specify exact paths
- If the task is large, break it into numbered sub-tasks
- Preserve the user's intent - do not add goals they didn't express

Show:
```
**Original:** <raw prompt>

**Refined:**
<restructured prompt>
```

Then ask: "Does this capture what you want? I can adjust before executing, or proceed as-is."

### 4 - Execute

Once confirmed, execute the refined prompt. Apply all context, requirements, and constraints from the refinement.
