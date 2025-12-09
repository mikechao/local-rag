import { useEffect, useState } from "react";
import { CheckIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  ModelSelector,
  ModelSelectorContent,
  ModelSelectorEmpty,
  ModelSelectorGroup,
  ModelSelectorInput,
  ModelSelectorItem,
  ModelSelectorList,
  ModelSelectorLogo,
  ModelSelectorName,
  ModelSelectorTrigger,
} from "@/components/ai-elements/model-selector";
import {
  hasCachedSmolLM3Weights,
  isSmolLM3ModelReadyFlag,
} from "@/lib/models/smolLM3Model";

interface LocalModelSelectorProps {
  value: string;
  onValueChange: (value: string) => void;
}

export function LocalModelSelector({ value, onValueChange }: LocalModelSelectorProps) {
  const [open, setOpen] = useState(false);
  const [isMistralAvailable, setIsMistralAvailable] = useState(false);

  useEffect(() => {
    const checkMistral = async () => {
      const cached = await hasCachedSmolLM3Weights();
      const ready = isSmolLM3ModelReadyFlag();
      setIsMistralAvailable(cached || ready);
    };
    checkMistral();
  }, []);

  const availableModels = [
    {
      id: "gemini-nano",
      name: "Gemini Nano",
      chef: "Google",
      chefSlug: "google",
      providers: ["google"],
    },
    ...(isMistralAvailable
      ? [
          {
            id: "smollm3-3b",
            name: "SmolLM3 3B",
            chef: "Hugging Face",
            chefSlug: "huggingface",
            providers: ["huggingface"],
          },
        ]
      : []),
  ];

  const selectedModelData =
    availableModels.find((m) => m.id === value) || availableModels[0];
  const chefs = Array.from(new Set(availableModels.map((model) => model.chef)));

  return (
    <ModelSelector open={open} onOpenChange={setOpen}>
      <ModelSelectorTrigger asChild>
        <Button className="gap-2 pl-2 pr-2 h-8" variant="noShadow" size="sm">
          <div className="flex items-center gap-2">
            {selectedModelData?.chefSlug && (
              <ModelSelectorLogo provider={selectedModelData.chefSlug} />
            )}
            {selectedModelData?.name && (
              <ModelSelectorName>{selectedModelData.name}</ModelSelectorName>
            )}
          </div>
        </Button>
      </ModelSelectorTrigger>
      <ModelSelectorContent className="mb-2">
        <ModelSelectorInput placeholder="Search models..." />
        <ModelSelectorList>
          <ModelSelectorEmpty>No models found.</ModelSelectorEmpty>
          {chefs.map((chef) => (
            <ModelSelectorGroup heading={chef} key={chef}>
              {availableModels
                .filter((model) => model.chef === chef)
                .map((model) => (
                  <ModelSelectorItem
                    key={model.id}
                    onSelect={() => {
                      onValueChange(model.id);
                      setOpen(false);
                    }}
                    value={model.id}
                  >
                    <ModelSelectorLogo provider={model.chefSlug} />
                    <ModelSelectorName>{model.name}</ModelSelectorName>
                    {value === model.id ? (
                      <CheckIcon className="ml-auto size-4" />
                    ) : (
                      <div className="ml-auto size-4" />
                    )}
                  </ModelSelectorItem>
                ))}
            </ModelSelectorGroup>
          ))}
        </ModelSelectorList>
      </ModelSelectorContent>
    </ModelSelector>
  );
}
