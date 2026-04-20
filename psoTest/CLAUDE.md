# PSO Package - Production Scheduling Optimization

This template provides a C3 AI Production Scheduling Optimization application.

## Instructions

For detailed guidance on building PSO applications, refer to the following instruction files:

- [PSO Data Model](instructions/pso-data-model-c3.md) - C3 type definitions and seed data structure
- [PSO Formulation Setup](instructions/pso-formulation-setup-c3.md) - MILP mathematical formulation and Gurobi testing
- [PSO Run Optimizer](instructions/pso-run-optimizer-c3.md) - Solver implementation and UI service
- [PSO UI Development](instructions/pso-ui-c3.md) - React UI guidelines, scenario management, and data contracts

## Key Concepts

- **PsoInput** is the top-level entity container for optimization input
- Use `py.3.12-optim_312-server-py4j` runtime for methods that run Gurobi optimization
- Always test locally with `test_solver.py` before C3 deployment
- Gurobi license limits: start with max 10-15 orders, 5-6 resources

## Example Resources

See `resource/examples/` for:

- `pso_input_example1.json` - Example input data structure
- `Example1-Formulation.pdf` and `Example2-Formulation.pdf` - Reference formulation documents
