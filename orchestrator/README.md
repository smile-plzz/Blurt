# Orchestrator / System-Prompt Agent

Glue layer, built last. Wires the LLM calls that turn a captured intent + persona into a structured reminder plan.

## Status

Not started — blocked by design. Do not start until Capture, Persona, and Reminder each work independently against stub data.

## Design constraint

Persona-read and reminder-plan-write are separate, explicit steps, not one opaque call, so the Persona Agent's inference logic stays swappable without touching this layer.

## Pipeline

capture -> persona read -> reminder plan (JSON) -> frontend render

## Depends on

All other build agents having at least a stubbed interface.
