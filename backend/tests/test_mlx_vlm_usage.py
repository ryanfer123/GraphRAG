from mlx_vlm import load, generate
from mlx_vlm.utils import load_config

model_path = "mlx-community/Qwen2-VL-2B-Instruct-4Bit"
print("Loading model...")
model, processor = load(model_path)
config = load_config(model_path)

prompt = "Briefly summarize the exact numbers or text visible in this image."
image_path = ["test_extracted_images/figure-2-1-small.jpg"]

messages = [
    {"role": "user", "content": [{"type": "image"}, {"type": "text", "text": prompt}]}
]

formatted_prompt = processor.apply_chat_template(
    messages, add_generation_prompt=True
)

print("Generating...")
output = generate(model, processor, prompt=formatted_prompt, image=image_path, max_tokens=150, verbose=False)
print("Output:", output)
